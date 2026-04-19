const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { applyVoiceScheduledAppointment } = require('../services/appointmentFromCall');

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
  const tenant_id = typeof req.body.tenant_id === 'string' ? req.body.tenant_id.trim() : req.body.tenant_id;
  const lead_id = typeof req.body.lead_id === 'string' ? req.body.lead_id.trim() : req.body.lead_id;
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
  const tenant_id =
    typeof req.body.tenant_id === 'string' ? req.body.tenant_id.trim() : req.body.tenant_id;
  const lead_id = typeof req.body.lead_id === 'string' ? req.body.lead_id.trim() : req.body.lead_id;
  const call_id = typeof req.body.call_id === 'string' ? req.body.call_id.trim() : req.body.call_id;
  const {
    transcript,
    summary,
    duration_seconds,
    outcome,
    appointment_requested,
    proposed_appointment_iso,
  } = req.body;
  if (!tenant_id || !lead_id || !call_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await db.getPool().connect();
  /** @type {{ applied: boolean; reason?: string; appointment_date?: string }} */
  let calendar = { applied: false };

  try {
    await client.query('BEGIN');

    const lockRow = await client.query(
      `SELECT id, metadata FROM leads WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
      [lead_id, tenant_id]
    );
    if (!lockRow.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead not found' });
    }

    const log = lockRow.rows[0].metadata?.communications_log;
    if (Array.isArray(log) && log.some((e) => e && e.call_id === call_id)) {
      await client.query('ROLLBACK');
      return res.json({ status: 'duplicate', lead_id, call_id, message: 'Already processed' });
    }

    const oc = outcome || 'unknown';
    const aiCallStatus = ['dial_failed', 'technical_failure', 'no_answer', 'user_busy', 'voicemail_or_machine'].includes(oc)
      ? 'Failed'
      : 'Completed';

    const metadataUpdate = {
      ai_call_status: aiCallStatus,
      call_transcript: transcript || '',
      call_result: oc,
      last_call_at: new Date().toISOString(),
      appointment_requested: Boolean(appointment_requested),
    };

    let newStatus = null;
    if (outcome === 'interested' || outcome === 'appointment_booked') {
      newStatus = 'interested';
    } else if (outcome === 'not_interested') {
      newStatus = 'not_interested';
    }

    const metaJson = JSON.stringify(metadataUpdate);

    if (newStatus) {
      await client.query(
        `UPDATE leads
         SET metadata = COALESCE(metadata, '{}') || $1::jsonb,
             status = $2,
             updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [metaJson, newStatus, lead_id, tenant_id]
      );
    } else {
      await client.query(
        `UPDATE leads
         SET metadata = COALESCE(metadata, '{}') || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [metaJson, lead_id, tenant_id]
      );
    }

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

    await client.query(
      `UPDATE leads
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'),
         '{communications_log}',
         COALESCE(metadata->'communications_log', '[]'::jsonb) || $1::jsonb
       ), updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify([commEntry]), lead_id, tenant_id]
    );

    try {
      calendar = await applyVoiceScheduledAppointment(
        {
          tenant_id,
          lead_id,
          proposed_appointment_iso:
            typeof proposed_appointment_iso === 'string' ? proposed_appointment_iso.trim() : proposed_appointment_iso,
          summary: summary || transcript || '',
        },
        client
      );
      if (calendar.applied) {
        console.log('[calls/result] CRM calendar scheduled from voice', lead_id, calendar.appointment_date);
      }
    } catch (e) {
      console.error('[calls/result] calendar from voice failed', e.message);
      calendar = { applied: false, reason: 'calendar_error' };
    }

    await client.query('COMMIT');
    return res.json({ status: 'updated', lead_id, call_id, calendar });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}));

// GET /v1/calls/:tenantId/summary — active call count from `calls` table (source of truth for live status)
router.get('/calls/:tenantId/summary', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE LOWER(TRIM(status)) = ANY (
           ARRAY['initiating','ringing','answered','active','dialing']::text[]
         )
       )::int AS active_count,
       COUNT(*)::int AS total_calls
     FROM calls WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = result.rows[0] || { active_count: 0, total_calls: 0 };
  return res.json({
    active_count: Number(row.active_count) || 0,
    total_calls: Number(row.total_calls) || 0,
  });
}));

// GET /v1/calls/:tenantId
// List calls for a tenant (reads from calls table)
router.get('/calls/:tenantId', asyncHandler(async (req, res) => {
  const tenantId = String(req.params.tenantId || '').trim();
  const { limit = 50, status, lead_id: leadIdRaw } = req.query;
  const leadId = typeof leadIdRaw === 'string' ? leadIdRaw.trim() : leadIdRaw;

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
    params.push(typeof status === 'string' ? status.trim() : status);
  }

  if (leadId) {
    query += ` AND c.lead_id = $${params.length + 1}`;
    params.push(leadId);
  }

  query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1}`;
  params.push(parseInt(limit, 10));

  const result = await db.query(query, params);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[calls:list]', { tenantId, count: result.rows.length, status: status || 'all' });
  }
  return res.json({ calls: result.rows, count: result.rows.length });
}));

module.exports = router;
