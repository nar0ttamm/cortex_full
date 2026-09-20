// Load environment variables (local dev only — Vercel injects them automatically).
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
const { requireUser, isPublicPath } = require('./middleware/auth');
const { rateLimit, clientIp } = require('./middleware/rateLimit');

// ─── Middleware ───────────────────────────────────────────────────────────────
const allowedOrigins = [config.crmUrl, 'https://www.cortexflow.in', 'https://cortexflow.in']
  .filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    return cb(null, false);
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'x-voice-secret', 'x-admin-token'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true })); // Required for Exotel form-encoded callbacks

app.use((req, res, next) => {
  if (req.path === '/health' || isPublicPath(req.path)) return next();
  if (req.path.startsWith('/v1')) return requireUser(req, res, next);
  return next();
});

app.use('/v1/demo/request', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyFn: (req) => `demo:${clientIp(req)}`,
}));
app.use('/v1/calls/start', rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: (req) => `call:${req.tenantId || clientIp(req)}`,
}));

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
// Manual + automatic notification triggers (WhatsApp / email)
app.use('/v1', require('./routes/notifications'));
// Demo request flow (landing page)
app.use('/v1', require('./routes/demo'));
// V2: Projects, teams, knowledge bases
app.use('/v1', require('./routes/projects'));
// V2: User management (admin creates users)
app.use('/v1', require('./routes/users'));
// V2: Knowledge base
app.use('/v1', require('./routes/knowledgeBase'));
// V2: Activity logs
app.use('/v1', require('./routes/activityLogs'));
// V2: Google Calendar OAuth
app.use('/v1', require('./routes/googleCalendar'));
// V2: Meta Lead Ads OAuth + webhook
app.use('/v1', require('./routes/metaIntegration'));
// V3: Agent runtime tools (product search, lead memory, analytics)
app.use('/v1', require('./routes/callTools'));

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
