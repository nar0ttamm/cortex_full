/**
 * Usage Tracker — Phase 10 of V3 Calling Stack Upgrade
 *
 * Tracks per-tenant, per-month usage for billing and cost control.
 * All operations are fire-and-forget — never let tracking break a call.
 */

const db = require('../db');

const ALLOWED_FIELDS = new Set([
  'calls_attempted',
  'calls_connected',
  'call_minutes_used',
  'demo_calls_used',
  'failed_calls',
  'no_answer_calls',
  'ai_input_tokens_estimated',
  'ai_output_tokens_estimated',
  'whatsapp_messages_sent',
  'emails_sent',
  'appointments_booked',
  'callbacks_scheduled',
]);

/**
 * Get the first day of the current month as a YYYY-MM-DD string.
 */
function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Increment a usage counter for a tenant in the current month.
 * Fire-and-forget — silently swallows errors.
 *
 * @param {string} tenantId
 * @param {string} field  - one of the allowed field names
 * @param {number} [increment=1]
 */
async function trackUsage(tenantId, field, increment = 1) {
  if (!tenantId || !field) return;
  if (!ALLOWED_FIELDS.has(field)) {
    console.warn(`[usageTracker] Unknown field: ${field}`);
    return;
  }

  const month = currentMonthStart();

  try {
    await db.query(
      `INSERT INTO tenant_usage (tenant_id, month, ${field})
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, month)
       DO UPDATE SET ${field} = tenant_usage.${field} + EXCLUDED.${field},
                     updated_at = NOW()`,
      [tenantId, month, increment]
    );
  } catch (err) {
    console.warn(`[usageTracker] Failed to track ${field} for ${tenantId}:`, err.message);
  }
}

// Minimum connected duration for billing (seconds)
const MIN_BILLABLE_SECONDS = 10;

/**
 * Track call duration in billing units.
 * Billing rule: round up to nearest 30 seconds, minimum MIN_BILLABLE_SECONDS.
 * Stored as fractional minutes (e.g. 45s → 0.75 min).
 * @param {string} tenantId
 * @param {number} durationSeconds
 */
async function trackCallMinutes(tenantId, durationSeconds) {
  if (!tenantId || !durationSeconds || durationSeconds < MIN_BILLABLE_SECONDS) return;
  // Round up to nearest 30s then convert to minutes
  const rounded = Math.ceil(durationSeconds / 30) * 30;
  const minutes = rounded / 60;
  await trackUsage(tenantId, 'call_minutes_used', minutes);
}

/**
 * Track a call outcome — call this ONCE per call result (from /calls/result).
 * Does NOT increment calls_attempted — that is tracked at call start separately.
 *
 * @param {string} tenantId
 * @param {object} opts
 * @param {string} opts.outcome
 * @param {number} [opts.durationSeconds]
 * @param {boolean} [opts.isDemo]
 */
async function trackCallOutcome(tenantId, { outcome, durationSeconds = 0, isDemo = false }) {
  if (!tenantId) return;

  if (isDemo) {
    await trackUsage(tenantId, 'demo_calls_used');
  }

  const failedOutcomes = ['dial_failed', 'technical_failure', 'no_answer', 'user_busy', 'voicemail_or_machine', 'failed'];
  const noAnswerOutcomes = ['no_answer', 'user_busy'];

  if (failedOutcomes.includes(outcome)) {
    await trackUsage(tenantId, 'failed_calls');
    if (noAnswerOutcomes.includes(outcome)) {
      await trackUsage(tenantId, 'no_answer_calls');
    }
  } else if (outcome && outcome !== 'unknown') {
    // Connected call — only count if above minimum duration
    if (durationSeconds >= MIN_BILLABLE_SECONDS) {
      await trackUsage(tenantId, 'calls_connected');
      await trackCallMinutes(tenantId, durationSeconds);
    }
  }

  if (outcome === 'appointment_booked') {
    await trackUsage(tenantId, 'appointments_booked');
  } else if (outcome === 'callback') {
    await trackUsage(tenantId, 'callbacks_scheduled');
  }
}

/**
 * Get usage summary for a tenant in a given month.
 * @param {string} tenantId
 * @param {string} [month] - YYYY-MM-DD (first of month), defaults to current month
 * @returns {Promise<object|null>}
 */
async function getTenantUsage(tenantId, month) {
  const m = month || currentMonthStart();
  try {
    const result = await db.query(
      `SELECT * FROM tenant_usage WHERE tenant_id = $1 AND month = $2`,
      [tenantId, m]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.warn('[usageTracker] getTenantUsage failed:', err.message);
    return null;
  }
}

module.exports = { trackUsage, trackCallMinutes, trackCallOutcome, getTenantUsage };
