/**
 * When a voice call ends with a concrete agreed slot (ISO from LLM), sync CRM calendar fields
 * (same shape as POST /v1/appointment/schedule — lead metadata used by /appointments UI).
 */
const db = require('../db');

const MS_PER_DAY = 86400000;

/** ISO-8601 datetime without Z / ±offset is ambiguous; Node may treat as local — assume IST for voice slots. */
function parseProposedAppointmentDate(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const hasExplicitZone = /[zZ]$/.test(t) || /[+-]\d{2}:?\d{2}$/.test(t);
  let s = t;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t) && !hasExplicitZone) {
    s = `${t.replace(/[zZ]$/i, '')}+05:30`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function appointmentPastGraceMs() {
  const n = parseInt(process.env.APPOINTMENT_ISO_PAST_GRACE_MS || '120000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 120000;
}

/**
 * @param {{ tenant_id: string; lead_id: string; proposed_appointment_iso?: string | null; summary?: string }} p
 * @param {import('pg').PoolClient | null} [dbClient] — if provided, all queries use this client (same transaction as caller).
 * @returns {Promise<{ applied: boolean; reason?: string; appointment_date?: string }>}
 */
async function applyVoiceScheduledAppointment(p, dbClient = null) {
  const q = dbClient ? (text, params) => dbClient.query(text, params) : db.query;

  const { tenant_id, lead_id, proposed_appointment_iso, summary } = p;
  const raw = proposed_appointment_iso;
  if (!raw || typeof raw !== 'string') {
    return { applied: false, reason: 'no_iso' };
  }
  const dt = parseProposedAppointmentDate(raw);
  if (!dt) {
    return { applied: false, reason: 'invalid_iso' };
  }
  const now = Date.now();
  const graceMs = appointmentPastGraceMs();
  if (dt.getTime() <= now - graceMs) {
    return { applied: false, reason: 'not_future' };
  }
  if (dt.getTime() - now > 366 * MS_PER_DAY) {
    return { applied: false, reason: 'too_far' };
  }

  const leadResult = await q('SELECT id, tenant_id, status, metadata FROM leads WHERE id = $1 AND tenant_id = $2', [
    lead_id,
    tenant_id,
  ]);
  if (leadResult.rows.length === 0) {
    return { applied: false, reason: 'lead_not_found' };
  }

  const lead = leadResult.rows[0];
  const meta = { ...(lead.metadata || {}) };
  const noteLine = summary ? `AI call: ${String(summary).slice(0, 800)}` : 'Scheduled from AI voice call';

  const updatedMeta = {
    ...meta,
    appointment_status: 'Scheduled',
    appointment_date: dt.toISOString(),
    appointment_notes: meta.appointment_notes
      ? `${String(meta.appointment_notes)}\n${noteLine}`.slice(0, 4000)
      : noteLine,
    reminder_1day_sent: false,
    reminder_3hr_sent: false,
    voice_scheduled_at: new Date().toISOString(),
  };

  let newStatus = lead.status;
  if (['new', 'contacted'].includes(lead.status)) {
    newStatus = 'interested';
  } else if (lead.status === 'not_interested') {
    newStatus = 'interested';
  }

  await q(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4',
    [newStatus, JSON.stringify(updatedMeta), lead_id, tenant_id]
  );

  return { applied: true, appointment_date: dt.toISOString() };
}

module.exports = { applyVoiceScheduledAppointment, parseProposedAppointmentDate };
