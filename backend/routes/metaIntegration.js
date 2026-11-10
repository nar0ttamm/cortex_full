/**
 * Meta Lead Ads OAuth + Webhook (Phase 8)
 *
 * GET  /v1/meta/auth?tenantId=        — Get OAuth URL
 * GET  /v1/meta/callback              — Handle OAuth callback
 * GET  /v1/meta/status?tenantId=      — Check connection status
 * GET  /v1/meta/webhook               — Webhook challenge verification
 * POST /v1/meta/webhook               — Receive leadgen events
 * DELETE /v1/meta/disconnect?tenantId= — Disconnect
 *
 * Required env vars:
 *   META_APP_ID
 *   META_APP_SECRET
 *   META_WEBHOOK_VERIFY_TOKEN
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { verifyMetaSignature } = require('../services/comms/webhookAuth');
const { encryptCredentials, decryptCredentials } = require('../encryption');
const { signState, readState } = require('../services/oauthState');

const router = Router();

const META_GRAPH = 'https://graph.facebook.com/v21.0';

function readCreds(stored) {
  if (!stored) return null;
  const text = String(stored);
  if (text.trim().startsWith('{')) {
    try { return JSON.parse(text); } catch { return null; }
  }
  try { return decryptCredentials(text); } catch { return null; }
}

function sessionTenant(req) {
  return req.tenantId || null;
}

router.get('/meta/auth', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  if (!tenantId || (req.query.tenantId && req.query.tenantId !== tenantId)) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  if (!config.metaAppId || !config.metaAppSecret) {
    return res.status(503).json({ error: 'Meta app credentials are not configured' });
  }
  const redirectUri = `${config.backendUrl}/v1/meta/callback`;
  const state = signState({ tenantId, projectId: req.query.projectId || null });
  const params = new URLSearchParams({
    client_id: config.metaAppId,
    redirect_uri: redirectUri,
    scope: 'leads_retrieval,pages_show_list,pages_manage_ads,pages_read_engagement,pages_manage_metadata',
    state,
    response_type: 'code',
  });
  return res.json({ url: `https://www.facebook.com/v21.0/dialog/oauth?${params}` });
}));

// GET /v1/meta/callback
router.get('/meta/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${config.crmUrl}/integrations?error=meta_denied`);
  }

  const decoded = readState(state);
  if (!decoded?.tenantId) return res.status(400).send('Invalid state');
  const tenantId = decoded.tenantId;
  const projectId = decoded.projectId || null;

  const redirectUri = `${config.backendUrl}/v1/meta/callback`;

  // Exchange code for short-lived token
  const tokenRes = await fetch(`${META_GRAPH}/oauth/access_token?${new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: redirectUri,
    code,
  })}`);

  if (!tokenRes.ok) {
    console.error('[meta] token exchange failed');
    return res.redirect(`${config.crmUrl}/integrations?error=meta_token_failed`);
  }

  const { access_token: shortLivedToken } = await tokenRes.json();

  // Exchange for long-lived token
  const longRes = await fetch(`${META_GRAPH}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    fb_exchange_token: shortLivedToken,
  })}`);

  const longBody = await longRes.json();
  if (!longRes.ok || !longBody.access_token) {
    return res.redirect(`${config.crmUrl}/integrations?error=meta_token_failed`);
  }
  const longLivedToken = longBody.access_token;
  const expires_in = longBody.expires_in;
  const expiry = new Date(Date.now() + (expires_in || 60 * 24 * 3600) * 1000).toISOString();

  await db.query(
    `INSERT INTO integrations (tenant_id, integration_key, integration_type, label, encrypted_credentials, status)
     VALUES ($1, 'meta_oauth', 'meta_oauth', 'Meta Lead Ads', $2, 'active')
     ON CONFLICT (tenant_id, integration_key) DO UPDATE
     SET encrypted_credentials = $2, status = 'active', updated_at = now()`,
    [tenantId, encryptCredentials({
      user_token: longLivedToken,
      token_expiry: expiry,
      project_id: projectId,
    })]
  );

  await db.query(
    `INSERT INTO activity_logs (tenant_id, project_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'integration_connected', 'meta', $1, $3)`,
    [tenantId, projectId, JSON.stringify({ integration: 'meta', pages_pending_selection: true })]
  ).catch(() => {});

  return res.redirect(`${config.crmUrl}/integrations?success=meta_connected`);
}));

// GET /v1/meta/webhook — Verify challenge
router.get('/meta/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.metaWebhookVerifyToken) {
    return res.send(challenge);
  }
  return res.status(403).send('Forbidden');
});

// POST /v1/meta/webhook — Receive leadgen events
router.post('/meta/webhook', asyncHandler(async (req, res) => {
  const valid = verifyMetaSignature(req.rawBody, req.headers['x-hub-signature-256'], config.metaAppSecret);
  if (!valid) return res.sendStatus(403);

  res.sendStatus(200); // Respond immediately

  const body = req.body;
  if (!body || body.object !== 'page') return;

  const entries = body.entry || [];
  for (const entry of entries) {
    const pageId = entry.id;
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== 'leadgen') continue;
      const { leadgen_id, form_id, page_id } = change.value;

      // Find tenant from page_id mapping
      const intResult = await db.query(
        `SELECT * FROM integrations WHERE integration_key = $1 AND integration_type = 'meta_page'`,
        [`meta_page_${page_id || pageId}`]
      );

      if (!intResult.rows.length) continue;

      const integration = intResult.rows[0];
      let creds;
      try { creds = readCreds(integration.encrypted_credentials); } catch { continue; }
      if (!creds?.page_access_token) continue;
      const selected = Array.isArray(creds.selected_form_ids) ? creds.selected_form_ids.map(String) : [];
      if (selected.length > 0 && form_id && !selected.includes(String(form_id))) continue;

      const tenantId = integration.tenant_id;
      const { resolveProject } = require('../services/projectResolver');
      const resolved = await resolveProject({
        tenantId,
        projectId: creds.project_id || null,
        source: 'meta',
        integrationKey: integration.integration_key,
      });
      const projectId = resolved.projectId;

      // Deduplicate
      const dupCheck = await db.query(
        `SELECT id FROM leads WHERE tenant_id = $1 AND metadata->>'meta_lead_id' = $2`,
        [tenantId, leadgen_id]
      );
      if (dupCheck.rows.length) continue;

      // Fetch lead details from Meta
      const leadRes = await fetch(`${META_GRAPH}/${leadgen_id}?access_token=${creds.page_access_token}`);
      if (!leadRes.ok) continue;
      const leadData = await leadRes.json();

      // Extract fields
      const fields = {};
      (leadData.field_data || []).forEach(f => { fields[f.name] = f.values?.[0] || ''; });

      const name = fields.full_name || fields.name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Meta Lead';
      const phone = fields.phone_number || fields.phone || '';
      const email = fields.email || '';
      const inquiry = fields.message || fields.comments || '';

      // Normalize phone
      const cleanPhone = phone.replace(/[^+\d]/g, '') || null;

      // Insert lead
      const leadResult = await db.query(
        `INSERT INTO leads (tenant_id, project_id, name, phone, email, inquiry, source, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'meta', 'new', $7)
         RETURNING id`,
        [
          tenantId, projectId, name, cleanPhone, email || null, inquiry || null,
          JSON.stringify({
            meta_lead_id: leadgen_id,
            form_id,
            page_id,
            raw_fields: fields,
            needs_project_assignment: Boolean(resolved.needsAssignment && !resolved.projectId),
            project_assignment_reason: resolved.needsAssignment && !resolved.projectId
              ? 'Assign a project so the AI knows what to sell.'
              : resolved.resolution,
          }),
        ]
      );

      const leadId = leadResult.rows[0].id;

      // Log activity
      await db.query(
        `INSERT INTO activity_logs (tenant_id, project_id, action_type, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'integration_lead_received', 'lead', $3, $4)`,
        [tenantId, projectId, leadId, JSON.stringify({ source: 'meta', meta_lead_id: leadgen_id })]
      ).catch(() => {});
    }
  }
}));

// GET /v1/meta/status
router.get('/meta/status', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  if (!tenantId || (req.query.tenantId && req.query.tenantId !== tenantId)) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  const oauth = await db.query(
    `SELECT status FROM integrations WHERE tenant_id = $1 AND integration_key = 'meta_oauth' AND status = 'active'`,
    [tenantId]
  );
  const pages = await db.query(
    `SELECT integration_key, label, status FROM integrations
     WHERE tenant_id = $1 AND integration_type = 'meta_page' AND status = 'active'`,
    [tenantId]
  );
  return res.json({
    connected: oauth.rows.length > 0,
    pages: pages.rows,
    redirect_uri: `${config.backendUrl}/v1/meta/callback`,
    webhook_url: `${config.backendUrl}/v1/meta/webhook`,
  });
}));

router.get('/meta/pages', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  if (!tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const stored = await db.query(
    `SELECT encrypted_credentials FROM integrations WHERE tenant_id = $1 AND integration_key = 'meta_oauth' AND status = 'active'`,
    [tenantId]
  );
  const creds = readCreds(stored.rows[0]?.encrypted_credentials);
  if (!creds?.user_token) return res.status(404).json({ error: 'Connect Meta before choosing pages' });
  const pagesRes = await fetch(`${META_GRAPH}/me/accounts?access_token=${encodeURIComponent(creds.user_token)}`);
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) return res.status(502).json({ error: pagesData.error?.message || 'Meta did not return pages' });
  return res.json({ pages: (pagesData.data || []).map((page) => ({ id: page.id, name: page.name })) });
}));

router.post('/meta/pages', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  if (!tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const pageIds = Array.isArray(req.body?.pageIds) ? req.body.pageIds.map(String) : [];
  if (pageIds.length === 0) return res.status(400).json({ error: 'Choose at least one Facebook Page' });
  const stored = await db.query(
    `SELECT encrypted_credentials FROM integrations WHERE tenant_id = $1 AND integration_key = 'meta_oauth' AND status = 'active'`,
    [tenantId]
  );
  const creds = readCreds(stored.rows[0]?.encrypted_credentials);
  if (!creds?.user_token) return res.status(404).json({ error: 'Connect Meta before choosing pages' });
  const pagesRes = await fetch(`${META_GRAPH}/me/accounts?access_token=${encodeURIComponent(creds.user_token)}`);
  const pagesData = await pagesRes.json();
  const chosen = (pagesData.data || []).filter((page) => pageIds.includes(String(page.id)));
  for (const page of chosen) {
    await db.query(
      `INSERT INTO integrations (tenant_id, integration_key, integration_type, label, encrypted_credentials, status)
       VALUES ($1, $2, 'meta_page', $3, $4, 'active')
       ON CONFLICT (tenant_id, integration_key) DO UPDATE
       SET encrypted_credentials = $4, label = $3, status = 'active', updated_at = now()`,
      [tenantId, `meta_page_${page.id}`, page.name, encryptCredentials({
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        project_id: creds.project_id || null,
        selected_form_ids: [],
      })]
    );
    await fetch(`${META_GRAPH}/${page.id}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: page.access_token, subscribed_fields: ['leadgen'] }),
    }).catch(() => {});
  }
  return res.json({ saved: chosen.map((page) => ({ id: page.id, name: page.name })) });
}));

router.get('/meta/forms', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  const pageId = String(req.query.pageId || '');
  if (!tenantId || !pageId) return res.status(400).json({ error: 'pageId is required' });
  const stored = await db.query(
    `SELECT encrypted_credentials FROM integrations WHERE tenant_id = $1 AND integration_key = $2 AND status = 'active'`,
    [tenantId, `meta_page_${pageId}`]
  );
  const creds = readCreds(stored.rows[0]?.encrypted_credentials);
  if (!creds?.page_access_token) return res.status(404).json({ error: 'That Page is not connected' });
  const formsRes = await fetch(`${META_GRAPH}/${pageId}/leadgen_forms?access_token=${encodeURIComponent(creds.page_access_token)}`);
  const formsData = await formsRes.json();
  if (!formsRes.ok) return res.status(502).json({ error: formsData.error?.message || 'Meta did not return forms' });
  return res.json({
    selected_form_ids: creds.selected_form_ids || [],
    forms: (formsData.data || []).map((form) => ({ id: form.id, name: form.name, status: form.status })),
  });
}));

router.post('/meta/forms', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  const pageId = String(req.body?.pageId || '');
  const formIds = Array.isArray(req.body?.formIds) ? req.body.formIds.map(String) : [];
  if (!tenantId || !pageId) return res.status(400).json({ error: 'pageId is required' });
  const stored = await db.query(
    `SELECT encrypted_credentials FROM integrations WHERE tenant_id = $1 AND integration_key = $2 AND status = 'active'`,
    [tenantId, `meta_page_${pageId}`]
  );
  const creds = readCreds(stored.rows[0]?.encrypted_credentials);
  if (!creds) return res.status(404).json({ error: 'That Page is not connected' });
  creds.selected_form_ids = formIds;
  await db.query(
    `UPDATE integrations SET encrypted_credentials = $1, updated_at = now() WHERE tenant_id = $2 AND integration_key = $3`,
    [encryptCredentials(creds), tenantId, `meta_page_${pageId}`]
  );
  return res.json({ saved: formIds });
}));

router.delete('/meta/disconnect', asyncHandler(async (req, res) => {
  const tenantId = sessionTenant(req);
  if (!tenantId || (req.query.tenantId && req.query.tenantId !== tenantId)) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  await db.query(
    `UPDATE integrations SET status = 'inactive' WHERE tenant_id = $1 AND integration_type IN ('meta_page', 'meta_oauth')`,
    [tenantId]
  );
  return res.json({ success: true });
}));

module.exports = router;
