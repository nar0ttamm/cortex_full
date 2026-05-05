/**
 * Demo request route — POST /v1/demo/request
 *
 * Flow:
 * 1. Validate input (name, whatsapp_number)
 * 2. Store demo_request in Supabase
 * 3. Create temporary lead in default tenant for demo call
 * 4. Trigger AI call (primary action)
 * 5. Send WhatsApp template message (fallback/retry)
 * 6. Track all statuses in demo_requests table
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');

const router = Router();

// POST /v1/demo/request
router.post('/demo/request', asyncHandler(async (req, res) => {
  const { name, whatsapp_number } = req.body;

  if (!name || !whatsapp_number) {
    return res.status(400).json({ error: 'name and whatsapp_number are required' });
  }

  const cleanedPhone = whatsapp_number.replace(/\s/g, '');
  if (!/^\+?[0-9]{10,15}$/.test(cleanedPhone)) {
    return res.status(400).json({ error: 'Invalid WhatsApp number format' });
  }

  // Normalise to E.164 — if no leading +, assume Indian number
  const phone = cleanedPhone.startsWith('+') ? cleanedPhone : `+91${cleanedPhone}`;

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null;

  // 1. Create demo request record
  const demoResult = await db.query(
    `INSERT INTO demo_requests (name, whatsapp_number, ip_address, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id`,
    [name, phone, ip]
  );
  const demoRequestId = demoResult.rows[0].id;

  const errors = [];

  // 2. Create temporary lead in demo tenant and trigger AI call
  let callTriggered = false;
  try {
    const tenantId = config.defaultTenantId;

    // Insert a temporary demo lead
    const leadResult = await db.query(
      `INSERT INTO leads (tenant_id, name, phone, source, status, metadata)
       VALUES ($1, $2, $3, 'demo', 'new', $4)
       RETURNING id`,
      [
        tenantId,
        name,
        phone,
        JSON.stringify({
          is_demo: true,
          demo_request_id: demoRequestId,
          inquiry: 'Demo request from CortexFlow landing page',
        }),
      ]
    );
    const leadId = leadResult.rows[0].id;

    // Mark call as triggered
    await db.query(
      `UPDATE demo_requests SET status = 'calling', call_triggered = true WHERE id = $1`,
      [demoRequestId]
    );
    callTriggered = true;

    // Trigger AI call (fire-and-forget, do not block response)
    const voiceServiceUrl = config.voiceServiceUrl;
    if (voiceServiceUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      fetch(`${voiceServiceUrl}/voice/start-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-voice-secret': config.voiceSecret || '',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          lead_id: leadId,
          phone,
          name,
          call_script: `Hello ${name} ji, main CortexFlow ki taraf se aapko ek live demo dene ke liye call kar raha hoon. Kya aap abhi baat kar sakte hain?`,
          demo_mode: true,
        }),
        signal: controller.signal,
      })
        .then(async (r) => {
          clearTimeout(timeout);
          if (r.ok) {
            await db.query(
              `UPDATE demo_requests SET call_completed = true, call_completed_at = now(), status = 'completed' WHERE id = $1`,
              [demoRequestId]
            );
          } else {
            const err = await r.json().catch(() => ({}));
            const msg = err.error || `Voice service returned ${r.status}`;
            await db.query(
              `UPDATE demo_requests SET status = 'failed', error_log = error_log || $1::jsonb WHERE id = $2`,
              [JSON.stringify([{ stage: 'call', error: msg, ts: new Date().toISOString() }]), demoRequestId]
            );
          }
        })
        .catch(async (err) => {
          clearTimeout(timeout);
          await db.query(
            `UPDATE demo_requests SET status = 'failed', error_log = error_log || $1::jsonb WHERE id = $2`,
            [JSON.stringify([{ stage: 'call', error: err.message, ts: new Date().toISOString() }]), demoRequestId]
          );
        });
    } else {
      errors.push({ stage: 'call', error: 'VOICE_SERVICE_URL not configured' });
      await db.query(
        `UPDATE demo_requests SET error_log = error_log || $1::jsonb WHERE id = $2`,
        [JSON.stringify(errors), demoRequestId]
      );
    }
  } catch (err) {
    errors.push({ stage: 'lead_creation', error: err.message });
    await db.query(
      `UPDATE demo_requests SET status = 'failed', error_log = error_log || $1::jsonb WHERE id = $2`,
      [JSON.stringify(errors), demoRequestId]
    );
  }

  // 3. Send WhatsApp template message (fire-and-forget fallback)
  sendDemoWhatsApp(phone, name, demoRequestId).catch(() => {});

  return res.json({
    success: true,
    demo_request_id: demoRequestId,
    call_triggered: callTriggered,
    message: 'Demo request received. Our AI agent will call you shortly.',
  });
}));

// POST /v1/demo/whatsapp-interaction
// Called when user clicks the WhatsApp button (retry demo call)
router.post('/demo/whatsapp-interaction', asyncHandler(async (req, res) => {
  const { demo_request_id } = req.body;

  if (!demo_request_id) {
    return res.status(400).json({ error: 'demo_request_id required' });
  }

  // Mark WhatsApp clicked
  await db.query(
    `UPDATE demo_requests SET whatsapp_clicked = true WHERE id = $1`,
    [demo_request_id]
  );

  const demoResult = await db.query(
    `SELECT * FROM demo_requests WHERE id = $1`,
    [demo_request_id]
  );
  if (!demoResult.rows.length) {
    return res.status(404).json({ error: 'Demo request not found' });
  }

  const demo = demoResult.rows[0];
  const tenantId = config.defaultTenantId;
  const voiceServiceUrl = config.voiceServiceUrl;

  if (!voiceServiceUrl) {
    return res.status(503).json({ error: 'Voice service not available' });
  }

  // Create new lead and retry call
  const leadResult = await db.query(
    `INSERT INTO leads (tenant_id, name, phone, source, status, metadata)
     VALUES ($1, $2, $3, 'demo_retry', 'new', $4)
     RETURNING id`,
    [
      tenantId,
      demo.name,
      demo.whatsapp_number,
      JSON.stringify({ is_demo: true, demo_request_id: demo_request_id, is_retry: true }),
    ]
  );
  const leadId = leadResult.rows[0].id;

  await db.query(
    `UPDATE demo_requests SET call_triggered = true, status = 'calling' WHERE id = $1`,
    [demo_request_id]
  );

  fetch(`${voiceServiceUrl}/voice/start-call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-voice-secret': config.voiceSecret || '',
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      lead_id: leadId,
      phone: demo.whatsapp_number,
      name: demo.name,
      demo_mode: true,
    }),
  })
    .then(async (r) => {
      if (r.ok) {
        await db.query(
          `UPDATE demo_requests SET call_completed = true, call_completed_at = now(), status = 'completed' WHERE id = $1`,
          [demo_request_id]
        );
      }
    })
    .catch(() => {});

  return res.json({ success: true, message: 'Demo call retry initiated.' });
}));

async function sendDemoWhatsApp(phone, name, demoRequestId) {
  try {
    const tenantId = config.defaultTenantId;
    const { getCredentials } = require('../services/credentialService');
    const creds = await getCredentials(tenantId, 'twilio');

    if (!creds?.account_sid || !creds?.auth_token || !creds?.whatsapp_number) {
      return;
    }

    const authHeader =
      'Basic ' + Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64');

    // Use WhatsApp Business template or fallback freeform message
    const body = [
      `Hi ${name}! 👋 Thanks for booking a CortexFlow demo.`,
      ``,
      `Our AI agent is calling you right now. Please pick up the call to experience a live demo.`,
      ``,
      `If you missed the call, reply "RETRY" or click the button below to get called again.`,
      ``,
      `— Team CortexFlow`,
    ].join('\n');

    const form = new URLSearchParams({
      From: `whatsapp:${creds.whatsapp_number}`,
      To: `whatsapp:${phone}`,
      Body: body,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );

    if (res.ok) {
      await db.query(
        `UPDATE demo_requests SET whatsapp_sent = true WHERE id = $1`,
        [demoRequestId]
      );
    }
  } catch {
    // Best-effort — do not throw
  }
}

module.exports = router;
