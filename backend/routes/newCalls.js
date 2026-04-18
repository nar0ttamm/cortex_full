const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');

const router = Router();

// Voice service secret guard (only voice-service can POST results)
function requireVoiceSecret(req, res, next) {
  const secret = req.headers['x-voice-secret'];
  if (config.voiceSecret && secret !== config.voiceSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

// POST /v1/calls/start
// Schedules and initiates an outbound AI call via cortex_voice service
router.post('/calls/start', asyncHandler(async (req, res) => {
  const { tenant_id, lead_id } = req.body;
  if (!tenant_id || !lead_id) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, lead_id' });
  }

  const leadResult = await db.query(
    'SELECT id, name, phone, inquiry FROM leads WHERE id = $1 AND tenant_id = $2',
    [lead_id, tenant_id]
  );
  if (leadResult.rows.length === 0) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  const lead = leadResult.rows[0];

  const voiceServiceUrl = config.voiceServiceUrl;
  if (!voiceServiceUrl) {
    return res.status(503).json({ error: 'Voice service not configured. Set VOICE_SERVICE_URL env var.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${voiceServiceUrl}/voice/start-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': config.voiceSecret || '',
      },
      body: JSON.stringify({
        tenant_id,
        lead_id,
        phone: lead.phone,
        name: lead.name,
        call_script: lead.inquiry ? `Hello, I'm calling regarding your inquiry: "${lead.inquiry}". Is this a good time to talk?` : undefined,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: 'Voice service error', details: err });
    }

    const result = await response.json();

    // Mark lead call as initiated
    await db.query(
      `UPDATE leads SET metadata = jsonb_set(
        COALESCE(metadata, '{}'),
        '{call_initiated}',
        'true'::jsonb
      ), updated_at = NOW() WHERE id = $1`,
      [lead_id]
    );

    return res.json({ status: 'initiated', call_id: result.call_id, lead_id });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Voice service timeout' });
    }
    throw err;
  }
}));

// POST /v1/calls/result
// Receives call result from cortex_voice service, updates lead (idempotent per call_id in communications_log)
router.post('/calls/result', requireVoiceSecret, asyncHandler(async (req, res) => {
  const {
    tenant_id,
    lead_id,
    call_id,
    transcript,
    summary,
    duration_seconds,
    outcome,
    appointment_requested,
  } = req.body;
  if (!tenant_id || !lead_id || !call_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dupCheck = await db.query(
    `SELECT metadata->'communications_log' as log FROM leads WHERE id = $1 AND tenant_id = $2`,
    [lead_id, tenant_id]
  );
  const log = dupCheck.rows[0]?.log;
  if (Array.isArray(log) && log.some((e) => e && e.call_id === call_id)) {
    return res.json({ status: 'duplicate', lead_id, call_id, message: 'Already processed' });
  }

  const oc = outcome || 'unknown';
  const aiCallStatus = ['dial_failed', 'technical_failure', 'no_answer'].includes(oc) ? 'Failed' : 'Completed';

  const metadataUpdate = {
    ai_call_status: aiCallStatus,
    call_transcript: transcript || '',
    call_result: oc,
    last_call_at: new Date().toISOString(),
    appointment_requested: Boolean(appointment_requested),
  };

  // Determine lead status update based on outcome
  let newStatus = null;
  if (outcome === 'interested' || outcome === 'appointment_booked') {
    newStatus = 'interested';
  } else if (outcome === 'not_interested') {
    newStatus = 'not_interested';
  }

  const metaJson = JSON.stringify(metadataUpdate);

  if (newStatus) {
    await db.query(
      `UPDATE leads
       SET metadata = COALESCE(metadata, '{}') || $1::jsonb,
           status = $2,
           updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [metaJson, newStatus, lead_id, tenant_id]
    );
  } else {
    await db.query(
      `UPDATE leads
       SET metadata = COALESCE(metadata, '{}') || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [metaJson, lead_id, tenant_id]
    );
  }

  // Log to communications_log
  const commEntry = {
    type: 'call',
    direction: 'outbound',
    message: summary || transcript || '',
    status: outcome || 'completed',
    timestamp: new Date().toISOString(),
    duration_seconds: duration_seconds || 0,
    call_id,
    appointment_requested: Boolean(appointment_requested),
  };

  await db.query(
    `UPDATE leads
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'),
       '{communications_log}',
       COALESCE(metadata->'communications_log', '[]'::jsonb) || $1::jsonb
     ), updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([commEntry]), lead_id]
  );

  return res.json({ status: 'updated', lead_id, call_id });
}));

// GET /v1/calls/:tenantId
// List calls for a tenant (reads from calls table)
router.get('/calls/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { limit = 50, status, lead_id: leadId } = req.query;

  let query = `
    SELECT c.*, l.name as lead_name, l.phone as lead_phone,
           ct.summary, ct.full_transcript
    FROM calls c
    LEFT JOIN leads l ON c.lead_id = l.id
    LEFT JOIN call_transcripts ct ON c.id = ct.call_id
    WHERE c.tenant_id = $1
  `;
  const params = [tenantId];

  if (status) {
    query += ` AND c.status = $${params.length + 1}`;
    params.push(status);
  }

  if (leadId) {
    query += ` AND c.lead_id = $${params.length + 1}`;
    params.push(leadId);
  }

  query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit, 10));

  const result = await db.query(query, params);
  return res.json({ calls: result.rows, count: result.rows.length });
}));

module.exports = router;
