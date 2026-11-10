const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../db');
const config = require('../config');
const { encryptCredentials } = require('../encryption');
const { processWebhookPayload, verifyWebhookSecret } = require('../integrations/webhookHandler');
const {
  SUPPORTED_INTEGRATIONS,
  createIntegration,
  listIntegrations,
  getIntegration,
  regenerateSecret,
  deleteIntegration,
  getIntegrationLogs,
} = require('../integrations/integrationManager');

const router = Router();

// ─── Inbound Webhook (Public) ─────────────────────────────────────────────────

// POST /v1/webhook/:tenantId/:integrationKey
// Receives lead payloads from any external source
router.post('/webhook/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  const { tenantId, integrationKey } = req.params;

  // Verify webhook secret (if configured)
  const valid = await verifyWebhookSecret(tenantId, integrationKey, req);
  if (valid === false) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const result = await processWebhookPayload({
    tenantId,
    integrationKey,
    payload: req.body,
  });

  // Always return Zapier-compatible response
  return res.status(result.status === 'created' ? 201 : 200).json({
    id: result.lead_id || null,
    status: result.status,
    reason: result.reason || undefined,
  });
}));

// GET /v1/webhook/:tenantId/:integrationKey/verify
// Webhook verification (Meta, Google, Typeform challenge-response)
router.get('/webhook/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  const { tenantId, integrationKey } = req.params;
  const hubMode = req.query['hub.mode'];
  const hubChallenge = req.query['hub.challenge'];
  const verifyToken = req.query['hub.verify_token'] || req.query.token;

  if ((hubMode === 'subscribe' && hubChallenge) || req.query.challenge) {
    const result = await db.query(
      `SELECT webhook_secret FROM integrations
       WHERE tenant_id = $1 AND integration_key = $2 AND status = 'active'`,
      [tenantId, integrationKey]
    );
    const secret = result.rows[0]?.webhook_secret;
    const { timingSafeEqualText } = require('../services/comms/webhookAuth');
    if (!secret || !timingSafeEqualText(verifyToken, secret)) {
      return res.status(403).json({ error: 'Invalid verify token' });
    }
    return res.send(String(hubChallenge || req.query.challenge));
  }

  return res.json({ status: 'active' });
}));

// ─── Integration Management (CRM API) ────────────────────────────────────────

// GET /v1/integrations/supported
// Return list of all supported integration types
function assertTenant(req, res) {
  if (!req.tenantId || req.params.tenantId !== req.tenantId) {
    res.status(403).json({ error: 'Tenant mismatch' });
    return false;
  }
  return true;
}

router.get('/integrations/platform', (_req, res) => {
  const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  return res.json({
    google_calendar_ready: Boolean(config.googleClientId && config.googleClientSecret && config.googleRedirectUri),
    google_redirect_uri: config.googleRedirectUri || `${backendUrl}/v1/google-calendar/callback`,
    meta_ready: Boolean(config.metaAppId && config.metaAppSecret && config.metaWebhookVerifyToken),
    meta_redirect_uri: `${backendUrl}/v1/meta/callback`,
    meta_webhook_url: `${backendUrl}/v1/meta/webhook`,
    meta_verify_token_set: Boolean(config.metaWebhookVerifyToken),
    backend_url: backendUrl,
  });
});

router.get('/integrations/supported', (_req, res) => {
  return res.json({ integrations: SUPPORTED_INTEGRATIONS });
});

// GET /v1/integrations/:tenantId
// List all integrations for a tenant
router.get('/integrations/:tenantId', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId } = req.params;
  const integrations = await listIntegrations(tenantId);
  return res.json({ integrations, count: integrations.length });
}));

router.get('/integrations/:tenantId/logs', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId } = req.params;
  const { integration_key, limit = 50 } = req.query;
  const logs = await getIntegrationLogs(tenantId, integration_key || null, parseInt(limit, 10));
  return res.json({ logs, count: logs.length });
}));

// GET /v1/integrations/:tenantId/:integrationKey
// Get a single integration with webhook URL and secret
router.get('/integrations/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId, integrationKey } = req.params;
  const integration = await getIntegration(tenantId, integrationKey);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  return res.json({ integration });
}));

// POST /v1/integrations/:tenantId
// Connect a new integration
router.post('/integrations/:tenantId', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId } = req.params;
  const { integration_key, label, credentials } = req.body;

  if (!integration_key) {
    return res.status(400).json({ error: 'Missing required field: integration_key' });
  }

  const integration = await createIntegration({
    tenantId,
    integrationKey: integration_key,
    label,
    credentials: credentials || {},
  });

  return res.status(201).json({ status: 'connected', integration });
}));

// POST /v1/integrations/:tenantId/:integrationKey/regenerate-secret
// Regenerate webhook secret
router.post('/integrations/:tenantId/:integrationKey/regenerate-secret', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId, integrationKey } = req.params;
  const newSecret = await regenerateSecret(tenantId, integrationKey);
  return res.json({ status: 'regenerated', webhook_secret: newSecret });
}));

// DELETE /v1/integrations/:tenantId/:integrationKey
// Disconnect an integration
router.delete('/integrations/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId, integrationKey } = req.params;
  const deleted = await deleteIntegration(tenantId, integrationKey);
  if (!deleted) return res.status(404).json({ error: 'Integration not found' });
  return res.json({ status: 'deleted' });
}));

// POST /v1/integrations/:tenantId/:integrationKey/test
// Test an integration with a dummy payload
router.post('/integrations/:tenantId/:integrationKey/test', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const { tenantId, integrationKey } = req.params;

  const testPayload = {
    name: 'Test Lead',
    phone: '9000000000',
    email: 'test@example.com',
    message: 'Integration test — this is a simulated lead',
    source: integrationKey,
    _test: true,
  };

  const result = await processWebhookPayload({
    tenantId,
    integrationKey,
    payload: testPayload,
    skipSecretCheck: true,
  });

  return res.json({ status: 'test_complete', result });
}));

router.post('/integrations/:tenantId/google-ads/key', asyncHandler(async (req, res) => {
  if (!assertTenant(req, res)) return;
  const googleKey = String(req.body?.google_key || '').trim();
  if (googleKey.length < 8) return res.status(400).json({ error: 'Use a webhook key of at least 8 characters' });
  const encrypted = encryptCredentials({ google_key: googleKey });
  await db.query(
    `INSERT INTO integrations (tenant_id, integration_key, integration_type, label, encrypted_credentials, status, created_at, updated_at)
     VALUES ($1, 'google_lead_forms', 'google_ads', 'Google Ads lead forms', $2, 'active', NOW(), NOW())
     ON CONFLICT (tenant_id, integration_key) DO UPDATE
     SET encrypted_credentials = $2, status = 'active', updated_at = NOW()`,
    [req.tenantId, encrypted]
  );
  const backendUrl = (config.backendUrl || '').replace(/\/$/, '');
  return res.json({
    status: 'saved',
    webhook_url: `${backendUrl}/v1/google-ads/lead/${req.tenantId}`,
  });
}));

module.exports = router;
