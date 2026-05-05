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

/**
 * Track call duration (in minutes) — use for billing.
 * @param {string} tenantId
 * @param {number} durationSeconds
 */
async function trackCallMinutes(tenantId, durationSeconds) {
  if (!tenantId || !durationSeconds) return;
  const minutes = Math.ceil(durationSeconds / 60);
  await trackUsage(tenantId, 'call_minutes_used', minutes);
}

/**
 * Convenience: track a completed call with all relevant counters.
 * @param {string} tenantId
 * @param {object} opts
 * @param {string} opts.outcome
 * @param {number} [opts.durationSeconds]
 * @param {boolean} [opts.isDemo]
 */
async function trackCallOutcome(tenantId, { outcome, durationSeconds = 0, isDemo = false }) {
  if (!tenantId) return;

  await trackUsage(tenantId, 'calls_attempted');

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
  } else {
    // Connected call
    await trackUsage(tenantId, 'calls_connected');
    if (durationSeconds > 0) {
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
