// Load environment variables (local dev only — Vercel injects them automatically)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
  const path = require('path');
  const fs = require('fs');
  const vercelEnv = path.join(__dirname, '.vercel', '.env.production.local');
  if (fs.existsSync(vercelEnv)) require('dotenv').config({ path: vercelEnv });
}

const express = require('express');
const cors = require('cors');

const app = express();
const config = require('./config');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Required for Exotel form-encoded callbacks

// ─── Health Check ─────────────────────────────────────────────────────────────
const db = require('./db');
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', timestamp: new Date().toISOString(), database: 'disconnected', error: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/v1', require('./routes/leads'));
app.use('/v1', require('./routes/calls'));
app.use('/v1', require('./routes/appointments'));
app.use('/v1', require('./routes/credentials'));
app.use('/v1', require('./routes/admin'));
app.use('/v1', require('./routes/internal'));
app.use('/v1', require('./routes/email'));
// New: AI voice calling engine endpoints
app.use('/v1', require('./routes/newCalls'));
// New: Universal lead integration engine endpoints
app.use('/v1', require('./routes/integrations'));

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── Local Dev Server ─────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`✓ Backend API running on port ${config.port}`);
    console.log(`✓ Health check: http://localhost:${config.port}/health`);
    console.log(`✓ Calling mode: ${config.callingMode}`);
  });

  // Start local cron jobs (replaced by Vercel Cron in production)
  try {
    const { startJobs } = require('./jobs/index');
    startJobs();
  } catch (err) {
    console.warn('⚠  node-cron not available — run npm install to enable local cron jobs');
  }
}

// Export for Vercel serverless
module.exports = app;
