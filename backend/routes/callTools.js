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

module.exports = router;
