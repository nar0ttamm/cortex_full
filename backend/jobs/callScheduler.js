/**
 * Call Scheduler Job
 *
 * Finds leads where:
 *   - metadata.scheduled_call_at <= NOW()
 *   - metadata.call_initiated = false
 *
 * For each matching lead, triggers a call (simulated or live based on CALLING_MODE)
 * and marks call_initiated = true to prevent double-firing.
 */

const db = require('../db');
const config = require('../config');

async function runCallScheduler() {
  const now = new Date().toISOString();

  // Query leads pending a call
  const result = await db.query(
    `SELECT id, tenant_id, name, phone, metadata
     FROM leads
     WHERE (metadata->>'call_initiated')::boolean = false
       AND metadata->>'scheduled_call_at' IS NOT NULL
       AND (metadata->>'scheduled_call_at')::timestamp <= $1::timestamp
       AND status NOT IN ('not_interested', 'closed')
     LIMIT 20`,
    [now]
  );

  const pending = result.rows;
  console.log(`[callScheduler] Found ${pending.length} lead(s) pending call`);

  if (pending.length === 0) return { processed: 0 };

  let processed = 0;
  let failed = 0;

  for (const lead of pending) {
    try {
      await processLeadCall(lead);
      processed++;
    } catch (err) {
      failed++;
      console.error(`[callScheduler] Failed to process lead ${lead.id}:`, err.message);
      // Mark as initiated anyway to prevent retry loops on permanent errors
      await markCallInitiated(lead.id, { call_error: err.message });
    }
  }

  return { processed, failed, total: pending.length };
}

async function processLeadCall(lead) {
  const mode = (lead.metadata?.calling_mode || config.callingMode).trim();

  // Mark call_initiated immediately to prevent concurrent duplicate calls
  await markCallInitiated(lead.id, { call_status: 'initiating' });

  if (mode === 'simulated') {
    await runSimulatedCall(lead);
  } else {
    await runLiveCall(lead);
  }
}

async function runSimulatedCall(lead) {
  // Inline simulation — mirrors /v1/call/simulate logic without HTTP round-trip
  const crypto = require('crypto');
  const callId = crypto.randomUUID();
  const duration = Math.floor(Math.random() * 90) + 30;
  const outcomes = ['interested', 'not_interested', 'callback_requested'];
  const callResult = outcomes[Math.floor(Math.random() * outcomes.length)];

  const statusMap = {
    interested: 'interested',
    not_interested: 'not_interested',
    callback_requested: 'callback_scheduled',
  };

  const transcriptMap = {
    interested: `Lead: Yes, I'm very interested. Please send me more details.\nAgent: Absolutely! I'll share everything via WhatsApp right away.`,
    not_interested: `Lead: I'm not interested anymore.\nAgent: I understand. Thank you for your time!`,
    callback_requested: `Lead: Can you call me back this evening?\nAgent: Of course! We'll follow up at a convenient time.`,
  };

  const analysis = {
    interested: callResult === 'interested',
    confirmed_appointment: false,
    needs_info: callResult === 'callback_requested',
    callback_time: callResult === 'callback_requested' ? 'Evening' : '',
    appointment_date: '',
    next_action: callResult === 'interested' ? 'send_info' : callResult === 'callback_requested' ? 'schedule_callback' : 'no_action',
  };

  const transcript = `[Auto-Scheduled Simulated Call]
Agent: Hello ${lead.name || 'there'}! Following up on your inquiry.
${transcriptMap[callResult]}
[Duration: ${duration}s]`;

  const updatedMeta = {
    ...(lead.metadata || {}),
    call_sid: callId,
    call_status: 'completed',
    call_duration: duration,
    call_transcript: transcript,
    call_analysis: analysis,
    call_result: callResult,
    calling_mode: 'simulated',
    call_initiated: true,
    last_call_at: new Date().toISOString(),
    ai_call_status: 'Completed',
  };

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [statusMap[callResult], JSON.stringify(updatedMeta), lead.id]
  );

  console.log(`[callScheduler] Simulated call complete for lead ${lead.id} → ${callResult}`);
}

async function runLiveCall(lead) {
  const { startExotelCall } = require('../services/callService');

  const callResponse = await startExotelCall({
    tenantId: lead.tenant_id,
    phone: lead.phone,
  });

  const callSid = callResponse?.Call?.Sid || callResponse?.sid || 'unknown';

  const updatedMeta = {
    ...(lead.metadata || {}),
    call_sid: callSid,
    call_status: 'initiated',
    call_initiated: true,
    calling_mode: 'live',
    last_call_at: new Date().toISOString(),
    ai_call_status: 'In Progress',
  };

  await db.query(
    'UPDATE leads SET metadata = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(updatedMeta), lead.id]
  );

  console.log(`[callScheduler] Live call initiated for lead ${lead.id}, SID: ${callSid}`);
}

async function markCallInitiated(leadId, extraMeta = {}) {
  await db.query(
    `UPDATE leads
     SET metadata = metadata || $1::jsonb, updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify({ call_initiated: true, ...extraMeta }), leadId]
  );
}

module.exports = { runCallScheduler };
