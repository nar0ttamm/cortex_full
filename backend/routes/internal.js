/**
 * Internal routes triggered by Vercel Cron Jobs.
 * These endpoints run background jobs: call scheduling, appointment reminders,
 * and the V3 call queue worker.
 *
 * Vercel Cron uses GET; optional Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
 * Set CRON_SECRET in Vercel dashboard. Locally, leave it unset to allow open access.
 */

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const db = require('../db');
const { runReminderJob } = require('../jobs/reminderJob');
const {
  getQueuedCalls,
  getActiveCalls,
  updateQueueStatus,
  scheduleRetry,
  canAttemptLead,
  MAX_CONCURRENT_CALLS,
} = require('../services/callQueueService');
const { requireCronSecret } = require('../middleware/auth');
const { startOutboundCall, StartCallError } = require('../services/startOutboundCall');

const router = Router();

function verifyCronSecret(req, res, next) {
  return requireCronSecret(req, res, next);
}

async function migrateLegacyScheduledLeads() {
  await db.query(
    `INSERT INTO call_queue (tenant_id, project_id, lead_id, priority, scheduled_at, status)
     SELECT l.tenant_id, l.project_id, l.id, 5,
            COALESCE((l.metadata->>'scheduled_call_at')::timestamptz, NOW()),
            'queued'
     FROM leads l
     WHERE COALESCE(l.metadata->>'call_initiated', 'false') NOT IN ('true', 'True')
       AND l.status NOT IN ('not_interested', 'closed')
       AND l.metadata->>'scheduled_call_at' IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM call_queue q
         WHERE q.lead_id = l.id
           AND q.status IN ('queued', 'retry_scheduled', 'processing', 'calling')
       )`
  ).catch((err) => console.warn('[queue-worker] legacy migrate skipped:', err.message));
}

// ─── V3 Queue Worker ──────────────────────────────────────────────────────────
/**
 * Consumes the call_queue table and fires outbound calls via the voice service.
 *
 * Idempotency: uses SELECT FOR UPDATE SKIP LOCKED inside a transaction so
 * concurrent cron invocations never double-process the same row.
 *
 * Retry eligibility: controlled by canAttemptLead (max 2 per day).
 */
async function runQueueWorker() {
  if (!config.voiceServiceUrl) {
    return { skipped: true, reason: 'VOICE_SERVICE_URL not configured' };
  }

  await migrateLegacyScheduledLeads();

  const active = await getActiveCalls();
  if (active >= MAX_CONCURRENT_CALLS) {
    return { skipped: true, reason: `at capacity (${active}/${MAX_CONCURRENT_CALLS} active)` };
  }

  const slots = MAX_CONCURRENT_CALLS - active;
  const candidates = await getQueuedCalls(slots * 2); // fetch extra to account for skips
  if (candidates.length === 0) {
    return { processed: 0, skipped: 0, reason: 'queue empty' };
  }

  let processed = 0;
  let skipped = 0;
  const errors = [];

  for (const job of candidates) {
    if (processed >= slots) break;

    // Daily attempt gate
    const eligible = await canAttemptLead(job.lead_id);
    if (!eligible) {
      await updateQueueStatus(job.id, 'max_attempts_reached', {
        failureReason: 'Max 2 attempts per day reached',
      });
      skipped++;
      continue;
    }

    // Lock the row inside a transaction — prevents double-processing under concurrent crons
    const client = await db.getPool().connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        `SELECT id FROM call_queue WHERE id = $1 AND status IN ('queued','retry_scheduled')
         FOR UPDATE SKIP LOCKED`,
        [job.id]
      );
      if (locked.rows.length === 0) {
        await client.query('ROLLBACK');
        skipped++;
        continue; // Another worker already grabbed this row
      }

      // Mark as processing immediately so capacity is respected
      await client.query(
        `UPDATE call_queue SET status = 'processing', updated_at = NOW() WHERE id = $1`,
        [job.id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      errors.push(`lock failed for ${job.id}: ${err.message}`);
      continue;
    } finally {
      client.release();
    }

    // ── Fire the call ──
    try {
      const tenantId = job.tenant_id;
      const leadId = job.lead_id;

      try {
        const result = await startOutboundCall({ tenantId, leadId });
        await updateQueueStatus(job.id, 'calling', { callId: result.call_id });
        processed++;
      } catch (err) {
        const message = err instanceof StartCallError ? err.message : err.message;
        errors.push(`job ${job.id}: ${message}`);
        if (err instanceof StartCallError && err.status === 409) {
          skipped++;
          continue;
        }
        const RETRIABLE = ['ECONNREFUSED', 'timeout', 'fetch failed', 'ETIMEDOUT', 'Voice service timeout'];
        const isRetriable = RETRIABLE.some((e) => String(message).toLowerCase().includes(e.toLowerCase()));
        if (isRetriable) {
          await scheduleRetry(job.id, 30);
        } else {
          await updateQueueStatus(job.id, 'failed', { failureReason: message });
        }
      }
    } catch (err) {
      errors.push(`job ${job.id}: ${err.message}`);
    }
  }

  return { processed, skipped, errors: errors.length ? errors : undefined };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

const processPendingCalls = asyncHandler(async (req, res) => {
  const result = await runQueueWorker();
  return res.json({ status: 'ok', ...result });
});

const processReminders = asyncHandler(async (req, res) => {
  const result = await runReminderJob();
  return res.json({ status: 'ok', ...result });
});

const processQueueWorker = asyncHandler(async (req, res) => {
  const result = await runQueueWorker();
  return res.json({ status: 'ok', ...result });
});

// GET/POST /v1/internal/process-pending-calls — Vercel Cron: * * * * *
router.get('/internal/process-pending-calls', verifyCronSecret, processPendingCalls);
router.post('/internal/process-pending-calls', verifyCronSecret, processPendingCalls);

// GET/POST /v1/internal/process-reminders — Vercel Cron: 0 * * * *
router.get('/internal/process-reminders', verifyCronSecret, processReminders);
router.post('/internal/process-reminders', verifyCronSecret, processReminders);

// GET/POST /v1/internal/queue-worker — Vercel Cron: * * * * * (every minute)
router.get('/internal/queue-worker', verifyCronSecret, processQueueWorker);
router.post('/internal/queue-worker', verifyCronSecret, processQueueWorker);

module.exports = router;
module.exports.runQueueWorker = runQueueWorker;
