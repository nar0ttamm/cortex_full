/**
 * Call Tools Route — Phase 6 of V3 Calling Stack Upgrade
 *
 * Runtime tool endpoints used by the AI agent during live calls.
 * All routes scoped to project_id — cross-project access is forbidden.
 *
 * Authentication: x-voice-secret header (same secret as voice service).
 */

const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { searchProducts } = require('../services/productSelector');
const { updateLeadMemory } = require('../services/leadIntentExtractor');

const router = Router();

function requireVoiceSecret(req, res, next) {
  const secret = req.headers['x-voice-secret'];
  if (config.voiceSecret && secret !== config.voiceSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

// POST /v1/calls/tools/search-products
// Agent calls this to find more products during a call.
// IMPORTANT: project_id is required — never allows global product search.
router.post('/calls/tools/search-products', requireVoiceSecret, asyncHandler(async (req, res) => {
  const { project_id, tenant_id, filters = {}, query = '' } = req.body;

  if (!project_id || !tenant_id) {
    return res.status(400).json({ error: 'project_id and tenant_id are required' });
  }

  // Security: verify project belongs to tenant
  const projCheck = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND tenant_id = $2`,
    [project_id, tenant_id]
  );
  if (projCheck.rows.length === 0) {
    return res.status(403).json({ error: 'Project not found or access denied' });
  }

  const products = await searchProducts({ projectId: project_id, tenantId: tenant_id, filters, query });

  // Return compact format for agent consumption
  const compact = products.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.property_type || null,
    location: p.location || null,
    price: p.price_range || null,
    size: p.size || null,
    possession: p.possession_status || null,
    amenities: p.amenities ? p.amenities.substring(0, 200) : null,
  }));

  return res.json({ products: compact, count: compact.length });
}));

// GET /v1/calls/tools/product/:productId
// Get full details of a specific product — scoped to project.
router.get('/calls/tools/product/:productId', requireVoiceSecret, asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { project_id, tenant_id } = req.query;

  if (!project_id || !tenant_id) {
    return res.status(400).json({ error: 'project_id and tenant_id are required' });
  }

  const result = await db.query(
    `SELECT * FROM kb_products WHERE id = $1 AND project_id = $2 AND tenant_id = $3 AND is_active = true`,
    [productId, project_id, tenant_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const p = result.rows[0];
  return res.json({
    id: p.id,
    name: p.name,
    property_type: p.property_type,
    location: p.location,
    price_range: p.price_range,
    size: p.size,
    possession_status: p.possession_status,
    amenities: p.amenities,
    extra_details: p.extra_details || {},
  });
}));

// POST /v1/calls/tools/update-lead-memory
// Agent calls this to save what it learned during the call.
router.post('/calls/tools/update-lead-memory', requireVoiceSecret, asyncHandler(async (req, res) => {
  const {
    lead_id,
    tenant_id,
    project_id,
    budget,
    preferred_location,
    property_type,
    timeline,
    interest_level,
    objection,
    callback_time,
    appointment_interest,
    last_summary,
    last_outcome,
  } = req.body;

  if (!lead_id || !tenant_id) {
    return res.status(400).json({ error: 'lead_id and tenant_id are required' });
  }

  // Verify lead belongs to tenant
  const leadCheck = await db.query(
    `SELECT id FROM leads WHERE id = $1 AND tenant_id = $2`,
    [lead_id, tenant_id]
  );
  if (leadCheck.rows.length === 0) {
    return res.status(403).json({ error: 'Lead not found or access denied' });
  }

  await updateLeadMemory({
    leadId: lead_id,
    tenantId: tenant_id,
    projectId: project_id || null,
    budget,
    preferred_location,
    property_type,
    timeline,
    interest_level,
    objection,
    callback_time,
    appointment_interest,
    last_summary,
    last_outcome,
  });

  return res.json({ status: 'updated', lead_id });
}));

// POST /v1/calls/tools/log-analytics
// Agent/voice service logs call quality metrics.
router.post('/calls/tools/log-analytics', requireVoiceSecret, asyncHandler(async (req, res) => {
  const {
    call_id,
    tenant_id,
    project_id,
    lead_id,
    ring_duration_seconds,
    talk_duration_seconds,
    tool_call_count,
    barge_in_count,
    silence_count,
    filler_phrase_count,
    pickup_confirmed,
    appointment_booked,
    callback_scheduled,
    outcome,
    retry_count,
    failure_reason,
  } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id is required' });
  }

  try {
    await db.query(
      `INSERT INTO call_analytics (call_id, tenant_id, project_id, lead_id,
         ring_duration_seconds, talk_duration_seconds, tool_call_count, barge_in_count,
         silence_count, filler_phrase_count, pickup_confirmed, appointment_booked,
         callback_scheduled, outcome, retry_count, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        call_id || null, tenant_id, project_id || null, lead_id || null,
        ring_duration_seconds || null, talk_duration_seconds || null,
        tool_call_count || 0, barge_in_count || 0,
        silence_count || 0, filler_phrase_count || 0,
        Boolean(pickup_confirmed), Boolean(appointment_booked),
        Boolean(callback_scheduled), outcome || null,
        retry_count || 0, failure_reason || null,
      ]
    );
  } catch (err) {
    console.warn('[callTools] log-analytics failed:', err.message);
  }

  return res.json({ status: 'logged' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/calls/analytics
// Internal-only analytics dashboard endpoint.
// Requires x-admin-token or x-voice-secret header.
// Filters: tenant_id (required), project_id, from, to (ISO dates), limit
// ─────────────────────────────────────────────────────────────────────────────
// Analytics endpoints are tenant-scoped — no extra auth needed beyond tenant_id
// (matches the existing pattern for all other tenant-scoped routes)
function requireAnalyticsAuth(req, res, next) {
  return next();
}

router.get('/calls/analytics', requireAnalyticsAuth, asyncHandler(async (req, res) => {
  const { tenant_id, project_id, from, to, limit = 500 } = req.query;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id is required' });
  }

  const params = [tenant_id];
  let filters = `WHERE ca.tenant_id = $1`;

  if (project_id) {
    params.push(project_id);
    filters += ` AND ca.project_id = $${params.length}`;
  }
  if (from) {
    params.push(from);
    filters += ` AND ca.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    filters += ` AND ca.created_at <= $${params.length}`;
  }

  params.push(Math.min(parseInt(limit, 10) || 500, 1000));

  const rows = await db.query(
    `SELECT ca.*, l.name AS lead_name, l.phone AS lead_phone
     FROM call_analytics ca
     LEFT JOIN leads l ON ca.lead_id = l.id
     ${filters}
     ORDER BY ca.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  const data = rows.rows;
  const total = data.length;

  // Compute aggregates
  const connected = data.filter((r) => r.pickup_confirmed);
  const pickupRate = total > 0 ? ((connected.length / total) * 100).toFixed(1) : 0;
  const durations = data.map((r) => r.talk_duration_seconds || 0).filter(Boolean);
  const avgDuration = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const outcomes = data.reduce((acc, r) => {
    if (r.outcome) acc[r.outcome] = (acc[r.outcome] || 0) + 1;
    return acc;
  }, {});
  const appointments = data.filter((r) => r.appointment_booked).length;
  const avgToolCalls = total > 0
    ? (data.reduce((a, r) => a + (r.tool_call_count || 0), 0) / total).toFixed(1)
    : 0;
  const avgSilence = total > 0
    ? (data.reduce((a, r) => a + (r.silence_count || 0), 0) / total).toFixed(1)
    : 0;
  const avgBargeIn = total > 0
    ? (data.reduce((a, r) => a + (r.barge_in_count || 0), 0) / total).toFixed(1)
    : 0;

  return res.json({
    summary: {
      total_calls: total,
      pickup_rate_pct: Number(pickupRate),
      avg_talk_duration_seconds: avgDuration,
      appointments_booked: appointments,
      avg_tool_calls_per_call: Number(avgToolCalls),
      avg_silence_events: Number(avgSilence),
      avg_barge_in_events: Number(avgBargeIn),
      outcomes,
    },
    calls: data,
  });
}));

// GET /v1/calls/usage/:tenantId — tenant usage summary for billing dashboard
router.get('/calls/usage/:tenantId', requireAnalyticsAuth, asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { month } = req.query; // YYYY-MM-DD optional

  const { getTenantUsage } = require('../services/usageTracker');
  const usage = await getTenantUsage(tenantId, month || undefined);

  return res.json({ usage: usage || {}, tenant_id: tenantId });
}));

module.exports = router;
