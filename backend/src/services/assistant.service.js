const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');

const ASSISTANT_PROMPT = `You are a filter parser for a humanitarian coordination dashboard.
A coordinator types a short natural-language query. Convert it into a strict JSON filter.

Return ONLY a single JSON object. No prose. No markdown fences.

Shape:
{
  "categories": array of zero or more of ["Health","Food","Water","Shelter","Infrastructure","Education","Safety","Other"],
  "min_impact_score": number between 0 and 1 (use 0 if unspecified; "high priority" ≈ 0.5, "critical" ≈ 0.7),
  "people_affected": optional object for filtering by estimated_people_affected using MongoDB-style comparison operators. Examples:
    - "more than 100 people" → { "$gt": 100 }
    - "fewer than 50 people" → { "$lt": 50 }
    - "at least 200 people" → { "$gte": 200 }
    - "at most 30 people" → { "$lte": 30 }
    - "between 50 and 200 people" → { "$gte": 50, "$lte": 200 }
    Omit this field entirely if the query does not mention a people count.
    CRITICAL: All values MUST be Numbers (e.g. 100), never Strings (e.g. "100").
  "impact_score": optional object for filtering impact_score with comparison operators, same syntax as people_affected. Examples:
    - "impact above 0.6" → { "$gt": 0.6 }
    - "score below 0.3" → { "$lt": 0.3 }
    Omit this field entirely if the query does not mention a specific score threshold. If the coordinator says "high priority" / "critical", prefer using min_impact_score instead of this field.
  "keywords": array of lowercase keywords to match against summarized_need (at most 5),
  "rationale": one short sentence explaining the chosen filter
}

Rules:
- If the coordinator mentions a specific category, include it.
- If the coordinator says "high priority" / "urgent" / "critical", raise min_impact_score.
- If they mention a concept not in the category list (e.g. "medical supplies"), put relevant keywords in the keywords array AND add the closest category.
- If the query is empty or unclear, return empty arrays and min_impact_score 0.
- When the coordinator mentions a number of people (e.g. "more than 100 people", "affecting 50+"), ALWAYS populate the people_affected field with the correct comparison operator.
- All numerical values in the filter MUST be JSON Numbers, never Strings.`;

let client = null;
function getClient() {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set.');
  }
  if (!client) client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client;
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Assistant response was not valid JSON');
    return JSON.parse(match[0]);
  }
}

function normalizeComparisonFilter(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const ops = ['$gt', '$lt', '$gte', '$lte'];
  const result = {};
  for (const op of ops) {
    if (op in obj) {
      const v = Number(obj[op]);
      if (Number.isFinite(v)) result[op] = v;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalize(parsed) {
  const allowed = ['Health', 'Food', 'Water', 'Shelter', 'Infrastructure', 'Education', 'Safety', 'Other'];
  const categories = Array.isArray(parsed.categories)
    ? parsed.categories.filter((c) => allowed.includes(c))
    : [];

  let min = Number(parsed.min_impact_score);
  if (!Number.isFinite(min)) min = 0;
  min = Math.max(0, Math.min(1, min));

  const people_affected = normalizeComparisonFilter(parsed.people_affected);
  const impact_score = normalizeComparisonFilter(parsed.impact_score);

  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .map((k) => String(k || '').trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim() : '';
  const result = { categories, min_impact_score: min, keywords, rationale };
  if (people_affected) result.people_affected = people_affected;
  if (impact_score) result.impact_score = impact_score;
  return result;
}

async function parseAssistantQuery(query) {
  const model = getClient().getGenerativeModel({
    model: env.GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });

  const prompt = `${ASSISTANT_PROMPT}\n\nCoordinator query:\n${query}`;
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const raw = result.response.text();
  console.log('[assistant] raw:', raw);
  const parsed = parseJson(raw);
  return normalize(parsed);
}

module.exports = { parseAssistantQuery };
