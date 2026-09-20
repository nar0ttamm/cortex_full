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

    // Create (or reuse) the demo lead. A repeat demo request from the same
    // number must not violate the UNIQUE (tenant_id, phone) constraint — reuse
    // the existing lead instead of failing.
    const leadResult = await db.query(
      `INSERT INTO leads (tenant_id, name, phone, source, status, metadata)
       VALUES ($1, $2, $3, 'demo', 'new', $4)
       ON CONFLICT (tenant_id, phone) DO UPDATE
         SET name       = EXCLUDED.name,
             source     = EXCLUDED.source,
             metadata   = COALESCE(leads.metadata, '{}'::jsonb) || EXCLUDED.metadata,
             updated_at = now()
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

    const { startOutboundCall } = require('../services/startOutboundCall');
    startOutboundCall({ tenantId, leadId, isDemo: true })
      .then(async () => {
        await db.query(
          `UPDATE demo_requests SET call_completed = true, call_completed_at = now(), status = 'completed' WHERE id = $1`,
          [demoRequestId]
        );
      })
      .catch(async (err) => {
        await db.query(
          `UPDATE demo_requests SET status = 'failed', error_log = error_log || $1::jsonb WHERE id = $2`,
          [JSON.stringify([{ stage: 'call', error: err.message, ts: new Date().toISOString() }]), demoRequestId]
        );
      });
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

  // Reuse the existing demo lead (same tenant_id + phone) for the retry call.
  const leadResult = await db.query(
    `INSERT INTO leads (tenant_id, name, phone, source, status, metadata)
     VALUES ($1, $2, $3, 'demo_retry', 'new', $4)
     ON CONFLICT (tenant_id, phone) DO UPDATE
       SET name       = EXCLUDED.name,
           source     = EXCLUDED.source,
           metadata   = COALESCE(leads.metadata, '{}'::jsonb) || EXCLUDED.metadata,
           updated_at = now()
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

  const { startOutboundCall } = require('../services/startOutboundCall');
  startOutboundCall({ tenantId, leadId, isDemo: true })
    .then(async () => {
      await db.query(
        `UPDATE demo_requests SET call_completed = true, call_completed_at = now(), status = 'completed' WHERE id = $1`,
        [demo_request_id]
      );
    })
    .catch(() => {});

  return res.json({ success: true, message: 'Demo call retry initiated.' });
}));

async function sendDemoWhatsApp(phone, name, demoRequestId) {
  try {
    const tenantId = config.defaultTenantId;
    const { sendWhatsApp } = require('../services/notificationService');

    // AiSensy template-based send (template: demo_welcome -> {{1}} = name)
    const result = await sendWhatsApp({
      tenantId,
      to: phone,
      campaignKey: 'demo_welcome',
      userName: name,
      templateParams: [name],
    });

    if (result && !result.skipped) {
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
