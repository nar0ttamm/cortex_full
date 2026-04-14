const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
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
  const { mode, challenge, 'hub.mode': hubMode, 'hub.challenge': hubChallenge } = req.query;

  // Meta Lead Ads verification
  if (hubMode === 'subscribe' && hubChallenge) {
    return res.send(hubChallenge);
  }

  // Generic challenge-response
  if (challenge) {
    return res.send(challenge);
  }

  return res.json({ status: 'active', message: 'Webhook endpoint ready' });
}));

// ─── Integration Management (CRM API) ────────────────────────────────────────

// GET /v1/integrations/supported
// Return list of all supported integration types
router.get('/integrations/supported', (_req, res) => {
  return res.json({ integrations: SUPPORTED_INTEGRATIONS });
});

// GET /v1/integrations/:tenantId
// List all integrations for a tenant
router.get('/integrations/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const integrations = await listIntegrations(tenantId);
  return res.json({ integrations, count: integrations.length });
}));

// GET /v1/integrations/:tenantId/:integrationKey
// Get a single integration with webhook URL and secret
router.get('/integrations/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  const { tenantId, integrationKey } = req.params;
  const integration = await getIntegration(tenantId, integrationKey);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });
  return res.json({ integration });
}));

// POST /v1/integrations/:tenantId
// Connect a new integration
router.post('/integrations/:tenantId', asyncHandler(async (req, res) => {
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
  const { tenantId, integrationKey } = req.params;
  const newSecret = await regenerateSecret(tenantId, integrationKey);
  return res.json({ status: 'regenerated', webhook_secret: newSecret });
}));

// DELETE /v1/integrations/:tenantId/:integrationKey
// Disconnect an integration
router.delete('/integrations/:tenantId/:integrationKey', asyncHandler(async (req, res) => {
  const { tenantId, integrationKey } = req.params;
  const deleted = await deleteIntegration(tenantId, integrationKey);
  if (!deleted) return res.status(404).json({ error: 'Integration not found' });
  return res.json({ status: 'deleted' });
}));

// GET /v1/integrations/:tenantId/logs/:integrationKey?
// Get integration event logs
router.get('/integrations/:tenantId/logs', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { integration_key, limit = 50 } = req.query;
  const logs = await getIntegrationLogs(tenantId, integration_key || null, parseInt(limit, 10));
  return res.json({ logs, count: logs.length });
}));

// POST /v1/integrations/:tenantId/:integrationKey/test
// Test an integration with a dummy payload
router.post('/integrations/:tenantId/:integrationKey/test', asyncHandler(async (req, res) => {
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

module.exports = router;
