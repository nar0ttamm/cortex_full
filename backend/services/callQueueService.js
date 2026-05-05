/**
 * Call Queue Service — Phase 8 of V3 Calling Stack Upgrade
 *
 * Manages the call_queue table.
 * Worker/cron picks calls based on capacity. Max concurrent calls = 3.
 * Retry logic: max 2 attempts per lead per day.
 */

const db = require('../db');

const MAX_ATTEMPTS_PER_DAY = 2;
const MAX_CONCURRENT_CALLS = parseInt(process.env.MAX_CONCURRENT_CALLS || '3', 10);
const DEFAULT_RETRY_DELAY_MINUTES = 120; // 2 hours

/**
 * Add a call to the queue.
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.projectId]
 * @param {string} opts.leadId
 * @param {number} [opts.priority=5]   lower = higher priority; demo=1, manual=2, auto=5
 * @param {Date|string|null} [opts.scheduledAt]  null = now
 * @returns {Promise<object>} queue row
 */
async function enqueueCall({ tenantId, projectId, leadId, priority = 5, scheduledAt = null }) {
  const scheduled = scheduledAt ? new Date(scheduledAt) : new Date();

  const result = await db.query(
    `INSERT INTO call_queue (tenant_id, project_id, lead_id, priority, scheduled_at, status, attempt_count)
     VALUES ($1, $2, $3, $4, $5, 'queued', 0)
     RETURNING *`,
    [tenantId, projectId || null, leadId, priority, scheduled.toISOString()]
  );
  return result.rows[0];
}

/**
 * Get queued calls that are ready to be processed.
 * Ordered by priority ASC, then scheduled_at ASC.
 */
async function getQueuedCalls(limit = 10) {
  const result = await db.query(
    `SELECT cq.*, l.name AS lead_name, l.phone, l.inquiry, l.project_id AS lead_project_id
     FROM call_queue cq
     JOIN leads l ON cq.lead_id = l.id
     WHERE cq.status IN ('queued', 'retry_scheduled')
       AND cq.scheduled_at <= NOW()
     ORDER BY cq.priority ASC, cq.scheduled_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Count active (in-progress) calls globally.
 */
async function getActiveCalls() {
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM call_queue
     WHERE status IN ('processing', 'calling')`
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

/**
 * Count active calls for a specific tenant.
 */
async function getTenantActiveCalls(tenantId) {
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM call_queue
     WHERE tenant_id = $1 AND status IN ('processing', 'calling')`,
    [tenantId]
  );
  return parseInt(result.rows[0]?.count || '0', 10);
}

/**
 * Check if we can fire another call (capacity gate).
 */
async function hasCapacity() {
  const active = await getActiveCalls();
  return active < MAX_CONCURRENT_CALLS;
}

/**
 * Update queue item status and optional fields.
 */
async function updateQueueStatus(queueId, status, extra = {}) {
  const { callId, failureReason } = extra;
  await db.query(
    `UPDATE call_queue
     SET status            = $1,
         call_id           = COALESCE($2, call_id),
         failure_reason    = COALESCE($3, failure_reason),
         last_attempt_at   = CASE WHEN $1 IN ('calling', 'processing') THEN NOW() ELSE last_attempt_at END,
         attempt_count     = CASE WHEN $1 = 'calling' THEN attempt_count + 1 ELSE attempt_count END,
         updated_at        = NOW()
     WHERE id = $4`,
    [status, callId || null, failureReason || null, queueId]
  );
}

/**
 * Schedule a retry for a call queue item.
 * @param {string} queueId
 * @param {number} [delayMinutes]
 */
async function scheduleRetry(queueId, delayMinutes = DEFAULT_RETRY_DELAY_MINUTES) {
  const retryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  await db.query(
    `UPDATE call_queue
     SET status       = 'retry_scheduled',
         scheduled_at = $1,
         updated_at   = NOW()
     WHERE id = $2`,
    [retryAt.toISOString(), queueId]
  );
}

/**
 * Check if this lead can be attempted today (max 2 attempts/day).
 */
async function canAttemptLead(leadId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM call_queue
     WHERE lead_id = $1
       AND last_attempt_at >= $2
       AND status NOT IN ('queued', 'cancelled', 'retry_scheduled')`,
    [leadId, today.toISOString()]
  );
  const count = parseInt(result.rows[0]?.count || '0', 10);
  return count < MAX_ATTEMPTS_PER_DAY;
}

/**
 * Cancel all queued calls for a lead.
 */
async function cancelLeadCalls(leadId) {
  await db.query(
    `UPDATE call_queue SET status = 'cancelled', updated_at = NOW()
     WHERE lead_id = $1 AND status IN ('queued', 'retry_scheduled')`,
    [leadId]
  );
}

module.exports = {
  enqueueCall,
  getQueuedCalls,
  getActiveCalls,
  getTenantActiveCalls,
  hasCapacity,
  updateQueueStatus,
  scheduleRetry,
  canAttemptLead,
  cancelLeadCalls,
  MAX_CONCURRENT_CALLS,
  MAX_ATTEMPTS_PER_DAY,
};
