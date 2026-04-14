const db = require('../db');
const { encryptCredentials, decryptCredentials } = require('../encryption');
const crypto = require('crypto');

/**
 * Integration lifecycle management.
 * Create, list, update, delete integrations per tenant.
 */

const SUPPORTED_INTEGRATIONS = [
  { key: 'meta_lead_ads', label: 'Meta Lead Ads', type: 'webhook', icon: 'meta' },
  { key: 'google_lead_forms', label: 'Google Lead Forms', type: 'webhook', icon: 'google' },
  { key: 'indiamart', label: 'IndiaMART', type: 'webhook', icon: 'indiamart' },
  { key: 'justdial', label: 'Justdial', type: 'webhook', icon: 'justdial' },
  { key: 'zapier', label: 'Zapier', type: 'webhook', icon: 'zapier' },
  { key: 'typeform', label: 'Typeform', type: 'webhook', icon: 'typeform' },
  { key: 'tally', label: 'Tally Forms', type: 'webhook', icon: 'tally' },
  { key: 'generic', label: 'Generic Webhook', type: 'webhook', icon: 'webhook' },
];

function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

async function createIntegration({ tenantId, integrationKey, label, credentials = {} }) {
  const supported = SUPPORTED_INTEGRATIONS.find(i => i.key === integrationKey);
  if (!supported) {
    throw new Error(`Unsupported integration: ${integrationKey}. Supported: ${SUPPORTED_INTEGRATIONS.map(i => i.key).join(', ')}`);
  }

  const webhookSecret = generateWebhookSecret();
  const encryptedCreds = Object.keys(credentials).length > 0
    ? encryptCredentials(credentials)
    : null;

  const result = await db.query(
    `INSERT INTO integrations
       (tenant_id, integration_key, integration_type, label, webhook_secret, encrypted_credentials, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
     ON CONFLICT (tenant_id, integration_key) DO UPDATE
       SET label = $4, status = 'active', updated_at = NOW()
     RETURNING id, tenant_id, integration_key, integration_type, label, status, created_at`,
    [tenantId, integrationKey, supported.type, label || supported.label, webhookSecret, encryptedCreds]
  );

  return { ...result.rows[0], webhook_secret: webhookSecret };
}

async function listIntegrations(tenantId) {
  const result = await db.query(
    `SELECT id, tenant_id, integration_key, integration_type, label, status, created_at, updated_at
     FROM integrations WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );

  const backendUrl = process.env.BACKEND_URL || '';

  return result.rows.map(row => ({
    ...row,
    webhook_url: `${backendUrl}/v1/webhook/${tenantId}/${row.integration_key}`,
  }));
}

async function getIntegration(tenantId, integrationKey) {
  const result = await db.query(
    `SELECT * FROM integrations WHERE tenant_id = $1 AND integration_key = $2`,
    [tenantId, integrationKey]
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const backendUrl = process.env.BACKEND_URL || '';

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    integration_key: row.integration_key,
    integration_type: row.integration_type,
    label: row.label,
    status: row.status,
    webhook_url: `${backendUrl}/v1/webhook/${tenantId}/${row.integration_key}`,
    webhook_secret: row.webhook_secret,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function regenerateSecret(tenantId, integrationKey) {
  const newSecret = generateWebhookSecret();
  await db.query(
    `UPDATE integrations SET webhook_secret = $1, updated_at = NOW()
     WHERE tenant_id = $2 AND integration_key = $3`,
    [newSecret, tenantId, integrationKey]
  );
  return newSecret;
}

async function deleteIntegration(tenantId, integrationKey) {
  const result = await db.query(
    `DELETE FROM integrations WHERE tenant_id = $1 AND integration_key = $2 RETURNING id`,
    [tenantId, integrationKey]
  );
  return result.rows.length > 0;
}

async function getIntegrationLogs(tenantId, integrationKey, limit = 50) {
  const result = await db.query(
    `SELECT id, integration_key, status, lead_id, error_message, created_at
     FROM integration_logs
     WHERE tenant_id = $1 ${integrationKey ? 'AND integration_key = $2' : ''}
     ORDER BY created_at DESC
     LIMIT ${integrationKey ? '$3' : '$2'}`,
    integrationKey ? [tenantId, integrationKey, limit] : [tenantId, limit]
  );
  return result.rows;
}

module.exports = {
  SUPPORTED_INTEGRATIONS,
  createIntegration,
  listIntegrations,
  getIntegration,
  regenerateSecret,
  deleteIntegration,
  getIntegrationLogs,
};
