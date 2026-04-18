/**
 * Internal routes triggered by Vercel Cron Jobs.
 * These endpoints run background jobs: call scheduling and appointment reminders.
 *
 * Vercel Cron uses GET; optional Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
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

// Vercel Cron invokes GET (not POST). Both methods supported for manual triggers.
const processPendingCalls = asyncHandler(async (req, res) => {
  const result = await runCallScheduler();
  return res.json({ status: 'ok', ...result });
});
const processReminders = asyncHandler(async (req, res) => {
  const result = await runReminderJob();
  return res.json({ status: 'ok', ...result });
});

// GET/POST /v1/internal/process-pending-calls — Vercel Cron: * * * * *
router.get('/internal/process-pending-calls', verifyCronSecret, processPendingCalls);
router.post('/internal/process-pending-calls', verifyCronSecret, processPendingCalls);

// GET/POST /v1/internal/process-reminders — Vercel Cron: 0 * * * *
router.get('/internal/process-reminders', verifyCronSecret, processReminders);
router.post('/internal/process-reminders', verifyCronSecret, processReminders);

module.exports = router;
