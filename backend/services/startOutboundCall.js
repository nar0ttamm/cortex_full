/**
 * Single outbound-call entry point used by the CRM start route, queue worker, and demo.
 * Creates a durable `calls` row before dialing Pipecat so the CRM Calls page stays true.
 */

const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { buildCallContext } = require('./callContextBuilder');
const { selectProducts } = require('./productSelector');
const { extractAndStoreIntent } = require('./leadIntentExtractor');
const { trackUsage } = require('./usageTracker');
const { resolveProject } = require('./projectResolver');

class StartCallError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function startOutboundCall({ tenantId, leadId, isDemo = false }) {
  if (!tenantId || !leadId) {
    throw new StartCallError(400, 'Missing required fields: tenant_id, lead_id');
  }
  if (!config.voiceServiceUrl) {
    throw new StartCallError(503, 'Voice service not configured. Set VOICE_SERVICE_URL.');
  }
  if (!config.voiceSecret && (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1')) {
    throw new StartCallError(503, 'VOICE_SECRET is not configured');
  }

  const leadResult = await db.query(
    'SELECT id, name, phone, inquiry, project_id FROM leads WHERE id = $1 AND tenant_id = $2',
    [leadId, tenantId]
  );
  if (leadResult.rows.length === 0) {
    throw new StartCallError(404, 'Lead not found');
  }
  const lead = leadResult.rows[0];

  if (!lead.project_id) {
    const resolved = await resolveProject({ tenantId, projectId: null });
    if (resolved.projectId) {
      await db.query(
        `UPDATE leads SET project_id = $1, metadata = COALESCE(metadata, '{}') || $2::jsonb, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [resolved.projectId, JSON.stringify({ needs_project_assignment: false, project_assignment_reason: resolved.reason }), leadId, tenantId]
      );
      lead.project_id = resolved.projectId;
    } else {
      await db.query(
        `UPDATE leads SET metadata = COALESCE(metadata, '{}') || $1::jsonb, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify({
          needs_project_assignment: true,
          project_assignment_reason: resolved.activeCount > 1
            ? 'Multiple projects exist — assign one before calling.'
            : 'Assign a project so the AI knows what to sell.',
        }), leadId, tenantId]
      );
      throw new StartCallError(409, 'Assign a project before starting an AI call. The agent needs project knowledge.');
    }
  }

  const guard = await db.query(
    `UPDATE leads
     SET metadata    = COALESCE(metadata, '{}') || '{"ai_call_status":"In Progress"}'::jsonb,
         updated_at  = NOW()
     WHERE id        = $1
       AND tenant_id = $2
       AND COALESCE(metadata->>'ai_call_status', '') != 'In Progress'
     RETURNING id`,
    [leadId, tenantId]
  );
  if (guard.rowCount === 0) {
    throw new StartCallError(409, 'A call is already in progress for this lead. Please wait for it to complete before starting another.');
  }

  const callId = crypto.randomUUID();

  await db.query(
    `INSERT INTO calls (id, tenant_id, lead_id, phone, status, project_id, started_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'initiating', $5, NOW(), NOW(), NOW())`,
    [callId, tenantId, leadId, lead.phone, lead.project_id || null]
  );

  let call_brief = null;
  try {
    await extractAndStoreIntent({
      leadId,
      tenantId,
      projectId: lead.project_id || null,
      inquiry: lead.inquiry || '',
    }).catch(() => {});

    const callContext = await buildCallContext({ tenantId, leadId });
    let initial_products = [];
    if (lead.project_id) {
      initial_products = await selectProducts({
        projectId: lead.project_id,
        tenantId,
        leadContext: {
          inquiry: lead.inquiry || '',
          preferred_location: callContext.call_context.lead_location,
          property_type: callContext.call_context.lead_property_type,
          budget: callContext.call_context.lead_budget,
        },
      });
    }
    call_brief = { ...callContext, initial_products };
  } catch (briefErr) {
    console.warn('[startOutboundCall] call_brief build failed:', briefErr.message);
  }

  void trackUsage(tenantId, 'calls_attempted').catch(() => {});
  if (isDemo) void trackUsage(tenantId, 'demo_calls_used').catch(() => {});

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${config.voiceServiceUrl.replace(/\/$/, '')}/voice/start-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': config.voiceSecret || '',
      },
      body: JSON.stringify({
        call_id: callId,
        tenant_id: tenantId,
        lead_id: leadId,
        phone: lead.phone,
        name: lead.name,
        call_script: lead.inquiry || undefined,
        call_brief,
        demo_mode: isDemo,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      await markCallFailed(callId, leadId, err.error || `HTTP ${response.status}`);
      const upstream = err && typeof err.error === 'string' ? err.error : '';
      const hint =
        upstream === 'Unauthorized'
          ? 'Voice service rejected the request (VOICE_SECRET must match on Vercel backend and voice VM).'
          : 'Voice service error';
      throw new StartCallError(502, hint, { details: err });
    }

    await db.query(
      `UPDATE calls SET status = 'dialing', updated_at = NOW() WHERE id = $1`,
      [callId]
    );
    await db.query(
      `UPDATE leads
       SET metadata   = COALESCE(metadata, '{}') || '{"call_initiated":true}'::jsonb,
           updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [leadId, tenantId]
    );

    const result = await response.json().catch(() => ({}));
    return { call_id: result.call_id || callId, lead_id: leadId, status: 'initiated' };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof StartCallError) throw err;
    await markCallFailed(callId, leadId, err.message);
    if (err.name === 'AbortError') {
      throw new StartCallError(504, 'Voice service timeout');
    }
    throw err;
  }
}

async function markCallFailed(callId, leadId, message) {
  await db.query(
    `UPDATE calls
     SET status = 'failed', error_message = $2, ended_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [callId, String(message || 'failed').slice(0, 500)]
  ).catch(() => {});
  await db.query(
    `UPDATE leads
     SET metadata   = COALESCE(metadata, '{}') || '{"ai_call_status":"Failed"}'::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [leadId]
  ).catch(() => {});
}

module.exports = { startOutboundCall, StartCallError };
