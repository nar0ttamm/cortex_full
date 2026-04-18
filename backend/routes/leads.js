const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { VALID_STATUSES, STATUS_TRANSITIONS, getLeadById, getLeadByPhone, mergeLeadMetadata } = require('../services/leadService');
const { sendLeadEntryNotifications } = require('../services/notificationService');

const router = Router();

// POST /v1/lead/ingest
// Create a new lead, fire notifications, schedule AI call
router.post('/lead/ingest', asyncHandler(async (req, res) => {
  const { tenant_id, name, phone, email, inquiry, source } = req.body;

  if (!tenant_id || !name || !phone) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, name, phone' });
  }

  // Idempotency check by phone
  const existing = await db.query(
    'SELECT id FROM leads WHERE tenant_id = $1 AND phone = $2',
    [tenant_id, phone]
  );
  if (existing.rows.length > 0) {
    return res.json({ status: 'duplicate', lead: existing.rows[0] });
  }

  const tenantResult = await db.query('SELECT settings FROM tenants WHERE id = $1', [tenant_id]);
  const fromSettings = tenantResult.rows[0]?.settings?.call_delay_seconds;
  const parsed = fromSettings != null ? parseInt(String(fromSettings), 10) : config.callDelaySeconds;
  const baseDelay =
    Number.isFinite(parsed) && parsed >= 60 ? parsed : config.callDelaySeconds;
  /** Product default: first outbound AI call 60s after lead ingest (ignore tenant values above 60 unless raised later). */
  const callDelaySeconds = Math.min(baseDelay, 60);

  const scheduledCallAt = new Date(Date.now() + callDelaySeconds * 1000).toISOString();

  const initialMetadata = {
    scheduled_call_at: scheduledCallAt,
    call_initiated: false,
    calling_mode: config.callingMode,
  };

  const result = await db.query(
    `INSERT INTO leads (tenant_id, name, phone, email, inquiry, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, NOW(), NOW())
     RETURNING id, tenant_id, name, phone, email, status, created_at`,
    [tenant_id, name, phone, email || null, inquiry || null, source || 'Unknown', JSON.stringify(initialMetadata)]
  );

  const lead = result.rows[0];

  // Fire notifications (parallel, errors are logged but do not fail this request)
  sendLeadEntryNotifications({
    tenantId: tenant_id,
    lead: { ...lead, inquiry, source, metadata: initialMetadata },
    adminEmail: config.adminEmail,
    adminPhone: config.adminPhone,
  }).catch((err) => console.error('[ingest] notification error:', err.message));

  return res.status(201).json({ status: 'created', lead });
}));

// GET /v1/leads/:tenantId
router.get('/leads/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { status, limit = 100 } = req.query;

  let query = 'SELECT * FROM leads WHERE tenant_id = $1';
  const params = [tenantId];

  if (status) {
    query += ' AND status = $2';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(parseInt(limit, 10));

  const result = await db.query(query, params);
  return res.json({ leads: result.rows, count: result.rows.length });
}));

// GET /v1/leads/:tenantId/:leadId
router.get('/leads/:tenantId/:leadId', asyncHandler(async (req, res) => {
  const { tenantId, leadId } = req.params;
  const result = await db.query(
    'SELECT * FROM leads WHERE tenant_id = $1 AND id = $2',
    [tenantId, leadId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  return res.json({ lead: result.rows[0] });
}));

// GET /v1/leads/by-phone/:tenantId/:phone
router.get('/leads/by-phone/:tenantId/:phone', asyncHandler(async (req, res) => {
  const { tenantId, phone } = req.params;
  const lead = await getLeadByPhone(tenantId, phone);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  return res.json({ lead });
}));

// PATCH /v1/leads/:leadId
router.patch('/leads/:leadId', asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { status, metadata } = req.body;

  const updates = [];
  const params = [];
  let i = 1;

  if (status !== undefined) { updates.push(`status = $${i++}`); params.push(status); }
  if (metadata !== undefined) { updates.push(`metadata = $${i++}`); params.push(JSON.stringify(metadata)); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  params.push(leadId);

  const result = await db.query(
    `UPDATE leads SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  return res.json({ status: 'updated', lead: result.rows[0] });
}));

// POST /v1/lead/status  — validated status transition
router.post('/lead/status', asyncHandler(async (req, res) => {
  const { lead_id, new_status, notes } = req.body;

  if (!lead_id || !new_status) {
    return res.status(400).json({ error: 'Missing required fields: lead_id, new_status' });
  }
  if (!VALID_STATUSES.includes(new_status)) {
    return res.status(400).json({ error: 'Invalid status', valid_statuses: VALID_STATUSES });
  }

  const lead = await getLeadById(lead_id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const allowed = STATUS_TRANSITIONS[lead.status] || [];
  if (lead.status !== new_status && !allowed.includes(new_status)) {
    return res.status(400).json({
      error: 'Invalid status transition',
      current_status: lead.status,
      new_status,
      allowed_transitions: allowed,
    });
  }

  const meta = lead.metadata || {};
  const history = meta.status_history || [];
  history.push({ from: lead.status, to: new_status, timestamp: new Date().toISOString(), notes: notes || null });

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [new_status, JSON.stringify({ ...meta, status_history: history, last_status_change: new Date().toISOString() }), lead_id]
  );

  return res.json({ status: 'updated', lead_id, previous_status: lead.status, new_status });
}));

// POST /v1/leads/:leadId/notes — append a note atomically
router.post('/leads/:leadId/notes', asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { text, author } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Note text required' });

  const note = { id: Date.now().toString(), text: text.trim(), author: author || 'Admin', timestamp: new Date().toISOString() };
  await db.query(
    `UPDATE leads
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{notes}',
       COALESCE(metadata->'notes', '[]'::jsonb) || $1::jsonb
     ), updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([note]), leadId]
  );
  return res.json({ status: 'added', note });
}));

// DELETE /v1/leads/:leadId/notes/:noteId — remove a note
router.delete('/leads/:leadId/notes/:noteId', asyncHandler(async (req, res) => {
  const { leadId, noteId } = req.params;
  const lead = await db.query('SELECT metadata FROM leads WHERE id = $1', [leadId]);
  if (lead.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const notes = (lead.rows[0].metadata?.notes || []).filter((n) => n.id !== noteId);
  await db.query(
    `UPDATE leads SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{notes}', $1::jsonb), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(notes), leadId]
  );
  return res.json({ status: 'deleted' });
}));

// POST /v1/lead/metadata  — non-destructive JSONB merge
router.post('/lead/metadata', asyncHandler(async (req, res) => {
  const { lead_id, metadata } = req.body;
  if (!lead_id || !metadata) {
    return res.status(400).json({ error: 'Missing required fields: lead_id, metadata' });
  }
  await mergeLeadMetadata(lead_id, metadata);
  return res.json({ status: 'updated', lead_id });
}));

module.exports = router;
