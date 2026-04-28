const app = require('./app');
const connectDB = require('./config/db');
const env = require('./config/env');

// GCP Cloud Run overrides:
// Google injects process.env.PORT dynamically at runtime. We MUST prioritize it.
const PORT = process.env.PORT || env.PORT || 4000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`[server] SRA backend listening on :${PORT} (${process.env.NODE_ENV || env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  }
}

start();
