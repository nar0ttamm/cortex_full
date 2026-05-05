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

const router = Router();

const META_GRAPH = 'https://graph.facebook.com/v19.0';

// GET /v1/meta/auth
router.get('/meta/auth', asyncHandler(async (req, res) => {
  const { tenantId, projectId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  if (!config.metaAppId) return res.status(503).json({ error: 'META_APP_ID not configured' });

  const state = Buffer.from(JSON.stringify({ tenantId, projectId: projectId || null })).toString('base64url');
  const redirectUri = `${config.backendUrl}/v1/meta/callback`;

  const params = new URLSearchParams({
    client_id: config.metaAppId,
    redirect_uri: redirectUri,
    scope: 'leads_retrieval,pages_show_list,pages_manage_ads,pages_read_engagement',
    state,
    response_type: 'code',
  });

  return res.json({ url: `https://www.facebook.com/v19.0/dialog/oauth?${params}` });
}));

// GET /v1/meta/callback
router.get('/meta/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${config.crmUrl}/integrations?error=meta_denied`);
  }

  let tenantId, projectId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    tenantId = decoded.tenantId;
    projectId = decoded.projectId || null;
  } catch {
    return res.status(400).send('Invalid state');
  }

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

  const { access_token: longLivedToken, expires_in } = await longRes.json();
  const expiry = new Date(Date.now() + (expires_in || 60 * 24 * 3600) * 1000).toISOString();

  // Fetch user pages
  const pagesRes = await fetch(`${META_GRAPH}/me/accounts?access_token=${longLivedToken}`);
  const pagesData = await pagesRes.json();
  const pages = pagesData.data || [];

  // Store integration + subscribe to leadgen webhook for each page
  for (const page of pages) {
    await db.query(
      `INSERT INTO integrations (tenant_id, integration_key, integration_type, label, encrypted_credentials, status)
       VALUES ($1, $2, 'meta_page', $3, $4, 'active')
       ON CONFLICT (tenant_id, integration_key) DO UPDATE
       SET encrypted_credentials = $4, status = 'active', updated_at = now()`,
      [tenantId, `meta_page_${page.id}`, page.name, JSON.stringify({
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        user_token: longLivedToken,
        token_expiry: expiry,
        project_id: projectId,
      })]
    ).catch(async () => {
      // integrations table might not have unique constraint on (tenant_id, integration_key)
      // Try upsert by deleting first
      await db.query(
        `INSERT INTO integrations (tenant_id, integration_key, integration_type, label, encrypted_credentials, status)
         VALUES ($1, $2, 'meta_page', $3, $4, 'active')`,
        [tenantId, `meta_page_${page.id}`, page.name, JSON.stringify({
          page_id: page.id, page_name: page.name, page_access_token: page.access_token,
          user_token: longLivedToken, token_expiry: expiry, project_id: projectId,
        })]
      );
    });

    // Subscribe page to leadgen webhook
    await fetch(`${META_GRAPH}/${page.id}/subscribed_apps?access_token=${page.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: ['leadgen'] }),
    }).catch(() => {});
  }

  // Log activity
  await db.query(
    `INSERT INTO activity_logs (tenant_id, project_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'integration_connected', 'meta', $1, $3)`,
    [tenantId, projectId, JSON.stringify({ pages_count: pages.length, integration: 'meta' })]
  ).catch(() => {});

  return res.redirect(`${config.crmUrl}/integrations?success=meta_connected&pages=${pages.length}`);
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
      try {
        creds = JSON.parse(integration.encrypted_credentials);
      } catch { continue; }

      const tenantId = integration.tenant_id;
      const projectId = creds.project_id || null;

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
          JSON.stringify({ meta_lead_id: leadgen_id, form_id, page_id, raw_fields: fields }),
        ]
      );

      const leadId = leadResult.rows[0].id;

      // Log activity
      await db.query(
        `INSERT INTO activity_logs (tenant_id, project_id, action_type, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'integration_lead_received', 'lead', $3, $4)`,
        [tenantId, projectId, leadId, JSON.stringify({ source: 'meta', meta_lead_id: leadgen_id })]
      ).catch(() => {});

      // Trigger backend lead workflow (notifications + call scheduling)
      await fetch(`${config.backendUrl}/v1/lead/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          lead_id: leadId,
          name,
          phone: cleanPhone,
          email,
          source: 'meta',
          from_webhook: true,
        }),
      }).catch(() => {});
    }
  }
}));

// GET /v1/meta/status
router.get('/meta/status', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `SELECT integration_key, label, status, created_at FROM integrations
     WHERE tenant_id = $1 AND integration_type = 'meta_page'`,
    [tenantId]
  );

  return res.json({ connected: result.rows.length > 0, pages: result.rows });
}));

// DELETE /v1/meta/disconnect
router.delete('/meta/disconnect', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  await db.query(
    `UPDATE integrations SET status = 'inactive' WHERE tenant_id = $1 AND integration_type = 'meta_page'`,
    [tenantId]
  );

  await db.query(
    `INSERT INTO activity_logs (tenant_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, 'integration_disconnected', 'meta', $1, '{"integration":"meta"}')`,
    [tenantId]
  ).catch(() => {});

  return res.json({ success: true });
}));

module.exports = router;
