const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { getLeadByPhone, getLeadById, mergeLeadMetadata } = require('../services/leadService');
const { transcribeCall, analyzeTranscript } = require('../services/aiService');
const { generateCallFlowXML, getCallResult, callResultToLeadStatus } = require('../services/callService');
const { sendWhatsApp } = require('../services/notificationService');

const router = Router();

// POST /v1/call/flow
// Exotel calls this URL during an active call to get TwiML instructions.
// If recording is present (second callback), transcribe + analyze + update lead.
router.post('/call/flow', asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Exotel sends form-encoded: CallSid, From, To, RecordingUrl, etc.
  const callSid = body.CallSid || body.call_sid || '';
  const toPhone = body.To || body.to || '';           // lead's phone
  const recordingUrl = body.RecordingUrl || body.recording_url || '';

  // If no recording yet, return initial TwiML
  if (!recordingUrl) {
    let leadName = '';
    if (toPhone) {
      const lead = await getLeadByPhone(config.defaultTenantId, toPhone).catch(() => null);
      leadName = lead?.name || '';
    }
    res.set('Content-Type', 'text/xml');
    return res.send(generateCallFlowXML({ leadName }));
  }

  // Recording available — find lead, transcribe, analyze
  // Look up lead by the "To" number (the lead's phone)
  const leadResult = await db.query(
    'SELECT * FROM leads WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [toPhone]
  );

  if (leadResult.rows.length === 0) {
    console.warn('[call/flow] Lead not found for phone:', toPhone);
    res.set('Content-Type', 'text/xml');
    return res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }

  const lead = leadResult.rows[0];
  const tenantId = lead.tenant_id;

  let transcript = '';
  let analysis = null;

  try {
    transcript = await transcribeCall({ tenantId, recordingUrl });
  } catch (err) {
    console.error('[call/flow] Deepgram failed:', err.message);
  }

  if (transcript) {
    try {
      analysis = await analyzeTranscript({ tenantId, transcript, lead });
    } catch (err) {
      console.error('[call/flow] OpenAI transcript analysis failed:', err.message);
    }
  }

  const callResult = getCallResult(analysis);
  const newStatus = callResultToLeadStatus(callResult);

  const updatedMeta = {
    ...(lead.metadata || {}),
    call_sid: callSid,
    call_status: 'completed',
    call_transcript: transcript,
    call_analysis: analysis,
    call_result: callResult,
    last_call_at: new Date().toISOString(),
    ai_call_status: 'Completed',
  };

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [newStatus, JSON.stringify(updatedMeta), lead.id]
  );

  // Return Exotel XML based on analysis
  const xml = generateResponseXML(analysis);
  res.set('Content-Type', 'text/xml');
  return res.send(xml);
}));

// POST /v1/call/status
// Exotel StatusCallback — fired after call ends with final status + recording URL
router.post('/call/status', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const callSid = body.CallSid || body.call_sid || '';
  const toPhone = body.To || body.to || '';
  const callStatus = body.Status || body.status || '';
  const duration = parseInt(body.Duration || body.duration || '0', 10);
  const recordingUrl = body.RecordingUrl || body.recording_url || '';

  if (!toPhone) return res.status(400).json({ error: 'Missing To phone number' });

  const lead = await getLeadByPhone(config.defaultTenantId, toPhone);
  if (!lead) {
    // Try global search
    const result = await db.query(
      'SELECT * FROM leads WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
      [toPhone]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  }

  const targetLead = lead || (await db.query(
    'SELECT * FROM leads WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [toPhone]
  )).rows[0];

  const tenantId = targetLead.tenant_id;

  let transcript = '';
  let analysis = null;

  if (recordingUrl && callStatus === 'completed') {
    try {
      transcript = await transcribeCall({ tenantId, recordingUrl });
    } catch (err) {
      console.error('[call/status] Deepgram failed:', err.message);
    }

    if (transcript) {
      try {
        analysis = await analyzeTranscript({ tenantId, transcript, lead: targetLead });
      } catch (err) {
        console.error('[call/status] OpenAI transcript analysis failed:', err.message);
      }
    }
  }

  const callResult = getCallResult(analysis);
  const newStatus = callResultToLeadStatus(callResult);

  const updatedMeta = {
    ...(targetLead.metadata || {}),
    call_sid: callSid,
    call_status: callStatus,
    call_duration: duration,
    call_recording_url: recordingUrl,
    call_transcript: transcript,
    call_analysis: analysis,
    call_result: callResult,
    last_call_at: new Date().toISOString(),
    ai_call_status: callStatus === 'completed' ? 'Completed' : 'Failed',
  };

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [callResult !== 'not_interested' ? newStatus : targetLead.status, JSON.stringify(updatedMeta), targetLead.id]
  );

  return res.json({ status: 'received', lead_id: targetLead.id, call_status: callStatus });
}));

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
// Simulate AI call without hitting Exotel (dev/pre-KYC mode)
router.post('/call/simulate', asyncHandler(async (req, res) => {
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

// Helpers

function generateResponseXML(analysis) {
  let message;
  if (analysis?.confirmed_appointment) {
    message = 'Great! Your appointment has been confirmed. We will send you the details via WhatsApp. Thank you!';
  } else if (analysis?.interested) {
    message = 'Wonderful! Our team will be in touch with you shortly via WhatsApp. Thank you!';
  } else if (analysis?.needs_info) {
    message = 'Thank you! We will send you more information via WhatsApp right away.';
  } else {
    message = 'Thank you for your time. Have a great day!';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">${message}</Say>
  <Hangup/>
</Response>`;
}

module.exports = router;
