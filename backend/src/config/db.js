const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and configure it.');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI);
  console.log('[db] MongoDB connected');
}

module.exports = connectDB;
