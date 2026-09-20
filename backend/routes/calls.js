const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { getLeadByPhone, getLeadById } = require('../services/leadService');
const { callResultToLeadStatus } = require('../services/callService');

const router = Router();

// POST /v1/call/event
// Generic call event update (used by CRM manually or third-party integrations)
router.post('/call/event', asyncHandler(async (req, res) => {
  const { tenant_id, call_sid, phone, status, duration, recording_url, transcript, analysis, call_result } = req.body;

  if (!tenant_id || !phone) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, phone' });
  }

  const lead = await getLeadByPhone(tenant_id, phone);
  if (!lead) return res.status(404).json({ error: 'Lead not found for this phone number' });

  const existingMeta = lead.metadata || {};
  let newStatus = lead.status;

  const updatedMeta = {
    ...existingMeta,
    call_sid: call_sid || existingMeta.call_sid,
    call_status: status || existingMeta.call_status,
    call_duration: duration || existingMeta.call_duration,
    call_recording_url: recording_url || existingMeta.call_recording_url,
    call_transcript: transcript || existingMeta.call_transcript,
    call_analysis: analysis || existingMeta.call_analysis,
    call_result: call_result || existingMeta.call_result,
    last_call_at: new Date().toISOString(),
  };

  if (call_result) {
    newStatus = callResultToLeadStatus(call_result);
    updatedMeta.ai_call_status = 'Completed';
  }

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [newStatus, JSON.stringify(updatedMeta), lead.id]
  );

  return res.json({ status: 'updated', lead_id: lead.id, new_status: newStatus });
}));

// POST /v1/call/simulate
// Simulate an AI call without placing a real call (dev / pre-provisioning mode)
router.post('/call/simulate', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    return res.status(403).json({ error: 'Simulated calls are disabled in production' });
  }
  const { tenant_id, phone, lead_id } = req.body;

  if (!tenant_id || !phone) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, phone' });
  }

  let lead;
  if (lead_id) {
    lead = await getLeadById(lead_id);
  } else {
    lead = await getLeadByPhone(tenant_id, phone);
  }

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const callId = crypto.randomUUID();
  const duration = Math.floor(Math.random() * 90) + 30;
  const outcomes = ['interested', 'not_interested', 'callback_requested'];
  const callResult = outcomes[Math.floor(Math.random() * outcomes.length)];

  const transcriptLines = {
    interested: `Lead: Yes, I'm interested. Can you tell me more?\nAgent: Absolutely! I'll send you details via WhatsApp right away.`,
    callback_requested: `Lead: I need to think about it. Can you call me back later?\nAgent: Of course. What time would work best for you?`,
    not_interested: `Lead: No, I'm not interested anymore.\nAgent: I understand. Thank you for your time. Have a great day!`,
  };

  const transcript = `[Simulated Call Transcript]
Agent: Hello ${lead.name || 'there'}! I'm calling about your inquiry regarding ${lead.inquiry || 'our services'}.
Lead: Yes, hello.
Agent: Are you still looking for information about this?
${transcriptLines[callResult]}
[Call ended - Duration: ${duration} seconds]`;

  const analysis = {
    interested: callResult === 'interested',
    confirmed_appointment: false,
    needs_info: callResult === 'callback_requested',
    callback_time: callResult === 'callback_requested' ? 'Evening' : '',
    appointment_date: '',
    next_action: callResult === 'interested' ? 'send_info' : callResult === 'callback_requested' ? 'schedule_callback' : 'no_action',
  };

  const newStatus = callResultToLeadStatus(callResult);

  const updatedMeta = {
    ...(lead.metadata || {}),
    call_sid: callId,
    call_status: 'completed',
    call_duration: duration,
    call_transcript: transcript,
    call_analysis: analysis,
    call_result: callResult,
    calling_mode: 'simulated',
    last_call_at: new Date().toISOString(),
    ai_call_status: 'Completed',
    call_initiated: true,
  };

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [newStatus, JSON.stringify(updatedMeta), lead.id]
  );

  return res.json({
    status: 'simulated',
    call_id: callId,
    lead_id: lead.id,
    call_status: 'completed',
    duration,
    call_result: callResult,
    transcript,
    analysis,
    new_status: newStatus,
  });
}));

module.exports = router;
