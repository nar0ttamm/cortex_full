const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { encryptCredentials, decryptCredentials } = require('../encryption');
const { timingSafeEqualText } = require('../services/comms/webhookAuth');
const { mapGoogleAdsLead } = require('../services/googleAdsLead');

const router = Router();

function openCreds(stored) {
  if (!stored) return null;
  const text = String(stored);
  if (text.trim().startsWith('{')) {
    try { return JSON.parse(text); } catch { return null; }
  }
  try { return decryptCredentials(text); } catch { return null; }
}

router.post('/google-ads/lead/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const mapped = mapGoogleAdsLead(req.body || {});
  if (!mapped.leadId || !mapped.googleKey) {
    return res.status(400).json({ error: 'lead_id and google_key are required' });
  }
  const integration = await db.query(
    `SELECT encrypted_credentials FROM integrations
     WHERE tenant_id = $1 AND integration_key = 'google_lead_forms' AND status = 'active'`,
    [tenantId]
  );
  const creds = openCreds(integration.rows[0]?.encrypted_credentials);
  if (!creds?.google_key || !timingSafeEqualText(mapped.googleKey, creds.google_key)) {
    return res.status(401).json({ error: 'Invalid google_key' });
  }
  if (mapped.isTest) {
    await db.query(
      `INSERT INTO integration_logs (tenant_id, integration_key, status, error_message, payload, created_at)
       VALUES ($1, 'google_lead_forms', 'test', NULL, $2, NOW())`,
      [tenantId, JSON.stringify({ lead_id: mapped.leadId, form_id: mapped.formId })]
    ).catch(() => {});
    return res.json({ status: 'test_accepted' });
  }
  if (!mapped.phone) return res.status(400).json({ error: 'A phone number is required' });
  const duplicate = await db.query(
    `SELECT id FROM leads WHERE tenant_id = $1 AND metadata->>'google_lead_id' = $2`,
    [tenantId, mapped.leadId]
  );
  if (duplicate.rows.length) return res.json({ status: 'duplicate', id: duplicate.rows[0].id });
  const inserted = await db.query(
    `INSERT INTO leads (tenant_id, name, phone, email, inquiry, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'google_ads', 'new', $6::jsonb, NOW(), NOW())
     RETURNING id`,
    [tenantId, mapped.name, mapped.phone, mapped.email || null, mapped.inquiry || null, JSON.stringify({
      google_lead_id: mapped.leadId,
      form_id: mapped.formId,
      campaign_id: mapped.campaignId,
      gcl_id: mapped.gclId,
      call_initiated: false,
    })]
  );
  await db.query(
    `INSERT INTO integration_logs (tenant_id, integration_key, status, lead_id, payload, created_at)
     VALUES ($1, 'google_lead_forms', 'created', $2, $3, NOW())`,
    [tenantId, inserted.rows[0].id, JSON.stringify({ lead_id: mapped.leadId, form_id: mapped.formId })]
  ).catch(() => {});
  return res.status(201).json({ status: 'created', id: inserted.rows[0].id });
}));

module.exports = router;
