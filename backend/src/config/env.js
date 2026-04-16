require('dotenv').config();

const required = ['MONGODB_URI', 'GEMINI_API_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(`[env] Missing required env vars: ${missing.join(', ')}`);
}

module.exports = {
  PORT: Number(process.env.PORT) || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
};
