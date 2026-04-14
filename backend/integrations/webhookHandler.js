const db = require('../db');
const { normalizeLead } = require('./leadNormalizer');
const asyncHandler = require('../utils/asyncHandler');
const crypto = require('crypto');

/**
 * Handles all incoming webhook payloads.
 * Verifies HMAC signature, normalizes the lead, and calls the ingest pipeline.
 */

/**
 * Verify webhook HMAC secret (optional, if tenant has one configured)
 * Supports both raw SHA256 HMAC and plain Bearer token validation.
 */
async function verifyWebhookSecret(tenantId, integrationKey, req) {
  // Fetch integration record
  const result = await db.query(
    `SELECT webhook_secret FROM integrations
     WHERE tenant_id = $1 AND integration_key = $2 AND status = 'active'`,
    [tenantId, integrationKey]
  );

  if (result.rows.length === 0) return false;

  const secret = result.rows[0].webhook_secret;
  if (!secret) return true; // No secret configured — allow all

  const authHeader = req.headers['authorization'] || '';
  const signature = req.headers['x-hub-signature-256'] ||
    req.headers['x-webhook-signature'] ||
    req.headers['x-signature'] || '';

  // Bearer token check
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7) === secret;
  }

  // HMAC SHA-256 check (Meta, GitHub style)
  if (signature.startsWith('sha256=')) {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  return false;
}

/**
 * Log integration event to DB
 */
async function logIntegrationEvent(tenantId, integrationKey, status, payload, leadId = null, error = null) {
  await db.query(
    `INSERT INTO integration_logs (tenant_id, integration_key, status, payload, lead_id, error_message, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [tenantId, integrationKey, status, JSON.stringify(payload), leadId, error]
  ).catch(e => console.error('[integrationLog]', e.message));
}

/**
 * Process an incoming webhook payload.
 * Called from route handler after basic validation.
 */
async function processWebhookPayload({ tenantId, integrationKey, payload, skipSecretCheck = false }) {
  // Normalize the lead data
  const normalized = normalizeLead(payload, integrationKey);

  if (!normalized.phone && !normalized.email) {
    await logIntegrationEvent(tenantId, integrationKey, 'rejected', payload, null, 'No phone or email in payload');
    return { status: 'rejected', reason: 'No phone or email field found in payload' };
  }

  // Idempotency check
  if (normalized.phone) {
    const existing = await db.query(
      'SELECT id FROM leads WHERE tenant_id = $1 AND phone = $2',
      [tenantId, normalized.phone]
    );
    if (existing.rows.length > 0) {
      await logIntegrationEvent(tenantId, integrationKey, 'duplicate', payload, existing.rows[0].id);
      return { status: 'duplicate', lead_id: existing.rows[0].id };
    }
  }

  // Get tenant config for call delay
  const tenantResult = await db.query(
    'SELECT settings FROM tenants WHERE id = $1',
    [tenantId]
  );
  const callDelaySeconds = tenantResult.rows[0]?.settings?.call_delay_seconds || 120;
  const scheduledCallAt = new Date(Date.now() + callDelaySeconds * 1000).toISOString();

  const initialMetadata = {
    scheduled_call_at: scheduledCallAt,
    call_initiated: false,
    calling_mode: process.env.CALLING_MODE || 'simulated',
    integration_source: integrationKey,
    ...(normalized.metadata || {}),
  };

  const insertResult = await db.query(
    `INSERT INTO leads (tenant_id, name, phone, email, inquiry, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, NOW(), NOW())
     RETURNING id`,
    [
      tenantId,
      normalized.name,
      normalized.phone,
      normalized.email || null,
      normalized.message || null,
      normalized.source,
      JSON.stringify(initialMetadata),
    ]
  );

  const leadId = insertResult.rows[0].id;

  await logIntegrationEvent(tenantId, integrationKey, 'success', payload, leadId);

  // Fire notifications async (same as /v1/lead/ingest)
  try {
    const { sendLeadEntryNotifications } = require('../services/notificationService');
    const config = require('../config');
    sendLeadEntryNotifications({
      tenantId,
      lead: { id: leadId, ...normalized, metadata: initialMetadata },
      adminEmail: config.adminEmail,
      adminPhone: config.adminPhone,
    }).catch(e => console.error('[webhook] notification error:', e.message));
  } catch (_) {}

  return { status: 'created', lead_id: leadId };
}

module.exports = { processWebhookPayload, verifyWebhookSecret, logIntegrationEvent };
