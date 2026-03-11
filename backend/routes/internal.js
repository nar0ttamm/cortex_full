/**
 * Internal routes triggered by Vercel Cron Jobs.
 * These endpoints run background jobs: call scheduling and appointment reminders.
 *
 * Vercel automatically adds Authorization: Bearer <CRON_SECRET> to cron requests.
 * Set CRON_SECRET in Vercel dashboard. Locally, leave it unset to allow open access.
 */

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { runCallScheduler } = require('../jobs/callScheduler');
const { runReminderJob } = require('../jobs/reminderJob');

const router = Router();

function verifyCronSecret(req, res, next) {
  if (!config.cronSecret) return next(); // Open in local dev
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${config.cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

// POST /v1/internal/process-pending-calls
// Vercel Cron: every minute  →  vercel.json cron schedule: "* * * * *"
router.post('/internal/process-pending-calls', verifyCronSecret, asyncHandler(async (req, res) => {
  const result = await runCallScheduler();
  return res.json({ status: 'ok', ...result });
}));

// POST /v1/internal/process-reminders
// Vercel Cron: every hour  →  vercel.json cron schedule: "0 * * * *"
router.post('/internal/process-reminders', verifyCronSecret, asyncHandler(async (req, res) => {
  const result = await runReminderJob();
  return res.json({ status: 'ok', ...result });
}));

module.exports = router;
