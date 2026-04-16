const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');

const EXTRACTION_PROMPT = `You are a humanitarian field-report analyzer for an NGO coordination platform.
A field worker has submitted a short observation. The submission may be text-only, or it may
also include a photo. Always analyze whatever is provided — never refuse just because an image
is missing. If only text is present, base your analysis entirely on the text.

Your job: extract a structured triage record.

Return ONLY a single valid JSON object. No prose. No markdown fences. No explanations.

Required shape:
{
  "category": one of ["Health", "Food", "Water", "Shelter", "Infrastructure", "Education", "Safety", "Other"],
  "urgency_score": integer from 1 (routine) to 10 (life-threatening, act now),
  "people_affected": integer estimate of people directly affected (minimum 1; default 1 if unclear),
  "summarized_need": one concise sentence (max 25 words) describing the concrete need on the ground
}

Calibration guidance for urgency_score:
- 1-3: routine / non-urgent needs (information, minor supplies).
- 4-6: important but not time-critical (ongoing shortages, degraded infrastructure).
- 7-8: urgent, needs response within hours (medical needs, vulnerable group at risk).
- 9-10: life-threatening emergency, mass impact, or vulnerable population in immediate danger.

If the text is ambiguous, make your best inference and still return valid JSON.`;

let client = null;
function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  if (!client) {
    client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }
  return client;
}

function parseJsonResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Gemini response was not valid JSON');
    }
    return JSON.parse(match[0]);
  }
}

function normalize(parsed) {
  const allowed = ['Health', 'Food', 'Water', 'Shelter', 'Infrastructure', 'Education', 'Safety', 'Other'];
  const category = allowed.includes(parsed.category) ? parsed.category : 'Other';

  let urgency = Number(parsed.urgency_score);
  if (!Number.isFinite(urgency)) urgency = 5;
  urgency = Math.max(1, Math.min(10, Math.round(urgency)));

  let people = Number(parsed.people_affected);
  if (!Number.isFinite(people) || people < 1) people = 1;
  people = Math.round(people);

  const summary = typeof parsed.summarized_need === 'string' ? parsed.summarized_need.trim() : '';

  return {
    category,
    urgency_score: urgency,
    people_affected: people,
    summarized_need: summary,
    model_version: env.GEMINI_MODEL,
  };
}

async function extractFromReport({ text, imageBuffer, imageMimeType }) {
  const hasImage = Boolean(imageBuffer && imageMimeType);

  console.log(
    `[gemini] extracting report — model=${env.GEMINI_MODEL} textLen=${(text || '').length} hasImage=${hasImage}${hasImage ? ` imageMime=${imageMimeType} imageBytes=${imageBuffer.length}` : ''}`
  );

  const model = getClient().getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });

  const userText = hasImage
    ? `${EXTRACTION_PROMPT}\n\nA photo is attached. Field report text:\n${text}`
    : `${EXTRACTION_PROMPT}\n\nNo photo attached — analyze the text alone. Field report text:\n${text}`;

  const parts = [{ text: userText }];

  if (hasImage) {
    parts.push({
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: imageMimeType,
      },
    });
  }

  let result;
  try {
    result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  } catch (err) {
    console.error('[gemini] generateContent threw:', err);
    if (err && err.response) {
      console.error('[gemini] err.response:', JSON.stringify(err.response, null, 2));
    }
    if (err && err.status) console.error('[gemini] err.status:', err.status);
    if (err && err.statusText) console.error('[gemini] err.statusText:', err.statusText);
    throw err;
  }

  let raw;
  try {
    raw = result.response.text();
  } catch (err) {
    console.error('[gemini] failed to read response text:', err);
    console.error('[gemini] raw response object:', JSON.stringify(result?.response, null, 2));
    throw err;
  }

  console.log('[gemini] raw response text:', raw);

  try {
    const parsed = parseJsonResponse(raw);
    return normalize(parsed);
  } catch (err) {
    console.error('[gemini] JSON parse failed. Raw was:', raw);
    throw err;
  }
}

module.exports = { extractFromReport };
