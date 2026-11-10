const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { VALID_STATUSES, STATUS_TRANSITIONS, getLeadById, getLeadByPhone, mergeLeadMetadata } = require('../services/leadService');
const { sendLeadEntryNotifications, getAdminContact } = require('../services/notificationService');
const { enqueueCall } = require('../services/callQueueService');
const { resolveProject } = require('../services/projectResolver');
const { seesAllLeads, canViewLead } = require('../services/leadAccess');
const { isAllowedLeadStatus } = require('../services/leadStatuses');
const { parseCsv, leadFromCsvRow } = require('../services/csvParse');
const { buildTimeline } = require('../services/leadTimeline');
const { buildConversionMetrics } = require('../services/conversionAnalytics');

const LEAD_SELECT = `
  SELECT l.*,
         p.name AS project_name,
         lc.score, lc.temperature, lc.next_action, lc.next_action_at, lc.human_handoff,
         lc.last_summary, lc.interest_level, lc.budget, lc.preferred_location, lc.property_type,
         lc.timeline, lc.callback_time, lc.score_signals, lc.ai_confidence, lc.preferred_product,
         lc.decision_maker, lc.objections,
         up.full_name AS assigned_name,
         (SELECT MIN(c.started_at) FROM calls c WHERE c.lead_id = l.id AND c.tenant_id = l.tenant_id) AS first_call_at
    FROM leads l
    LEFT JOIN projects p ON p.id = l.project_id
    LEFT JOIN lead_context lc ON lc.lead_id = l.id
    LEFT JOIN user_profiles up ON up.id = l.assigned_to
`;

const router = Router();

// POST /v1/lead/ingest
// Create a new lead, fire notifications, schedule AI call
router.post('/lead/ingest', asyncHandler(async (req, res) => {
  const { tenant_id, name, phone, email, inquiry, source, project_id, projectId } = req.body;

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

  const resolved = await resolveProject({
    tenantId: tenant_id,
    projectId: project_id || projectId || null,
    source,
  });

  const tenantResult = await db.query('SELECT settings FROM tenants WHERE id = $1', [tenant_id]);
  const fromSettings = tenantResult.rows[0]?.settings?.call_delay_seconds;
  const parsed = fromSettings != null ? parseInt(String(fromSettings), 10) : config.callDelaySeconds;
  const baseDelay =
    Number.isFinite(parsed) && parsed >= 60 ? parsed : config.callDelaySeconds;
  /** Product default: first outbound AI call 60s after lead ingest (ignore tenant values above 60 unless raised later). */
  const callDelaySeconds = Math.min(baseDelay, 60);

  const scheduledCallAt = new Date(Date.now() + callDelaySeconds * 1000).toISOString();
  const needsProject = resolved.needsAssignment && !resolved.projectId;

  const initialMetadata = {
    scheduled_call_at: needsProject ? null : scheduledCallAt,
    call_initiated: false,
    calling_mode: config.callingMode,
    needs_project_assignment: needsProject,
    project_assignment_reason: needsProject
      ? (resolved.activeCount > 1
        ? 'Multiple projects exist — assign one before the AI calls.'
        : 'Create or assign a project so the AI knows what to sell.')
      : resolved.reason,
  };

  const result = await db.query(
    `INSERT INTO leads (tenant_id, project_id, name, phone, email, inquiry, source, status, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, NOW(), NOW())
     RETURNING id, tenant_id, project_id, name, phone, email, status, created_at`,
    [tenant_id, resolved.projectId, name, phone, email || null, inquiry || null, source || 'Unknown', JSON.stringify(initialMetadata)]
  );

  const lead = result.rows[0];

  if (!needsProject) {
    await enqueueCall({
      tenantId: tenant_id,
      projectId: resolved.projectId,
      leadId: lead.id,
      priority: 5,
      scheduledAt: scheduledCallAt,
    }).catch((err) => console.warn('[ingest] enqueue failed:', err.message));
  }

  const admin = await getAdminContact(tenant_id).catch(() => ({
    adminEmail: config.adminEmail,
    adminPhone: config.adminPhone,
  }));

  sendLeadEntryNotifications({
    tenantId: tenant_id,
    lead: { ...lead, inquiry, source, metadata: initialMetadata },
    adminEmail: admin.adminEmail,
    adminPhone: admin.adminPhone,
  }).catch((err) => console.error('[ingest] notification error:', err.message));

  return res.status(201).json({
    status: 'created',
    lead,
    project: { id: resolved.projectId, name: resolved.projectName, reason: resolved.reason },
    queued: !needsProject,
  });
}));

// GET /v1/leads/:tenantId
router.get('/leads/:tenantId', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.params.tenantId;
  if (req.tenantId && req.params.tenantId && req.params.tenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  const { status, limit = 100 } = req.query;

  let query = `${LEAD_SELECT} WHERE l.tenant_id = $1`;
  const params = [tenantId];

  if (status) {
    query += ` AND l.status = $${params.length + 1}`;
    params.push(status);
  }

  if (!seesAllLeads(req.role)) {
    query += ` AND (l.assigned_to IS NULL OR l.assigned_to = (SELECT id FROM user_profiles WHERE user_id = $${params.length + 1} AND tenant_id = l.tenant_id LIMIT 1))`;
    params.push(req.userId);
  }

  query += ' ORDER BY l.created_at DESC LIMIT $' + (params.length + 1);
  params.push(parseInt(limit, 10));

  const result = await db.query(query, params);
  return res.json({ leads: result.rows, count: result.rows.length });
}));

router.get('/leads/:tenantId/duplicates', asyncHandler(async (req, res) => {
  if (req.tenantId && req.params.tenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  const result = await db.query(
    `SELECT phone, COUNT(*)::int AS count,
            json_agg(json_build_object('id', id, 'name', name, 'status', status, 'created_at', created_at) ORDER BY created_at) AS leads
     FROM leads
     WHERE tenant_id = $1 AND phone IS NOT NULL AND phone <> ''
     GROUP BY phone
     HAVING COUNT(*) > 1
     ORDER BY count DESC
     LIMIT 100`,
    [req.tenantId]
  );
  return res.json({ duplicates: result.rows });
}));

router.post('/leads/import', asyncHandler(async (req, res) => {
  if (!req.tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const parsed = parseCsv(req.body?.csv || '');
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const preview = parsed.rows.map((record) => ({ row: record.row, ...leadFromCsvRow(record.value) }));
  const invalid = [];
  const candidates = [];
  preview.forEach((row) => {
    if (!row.name || !row.phone) invalid.push({ row: row.row, error: 'Name and phone are required' });
    else candidates.push(row);
  });
  const seen = new Set();
  const fileDuplicates = [];
  const unique = [];
  candidates.forEach((row) => {
    const key = row.phone.replace(/\s+/g, '');
    if (seen.has(key)) fileDuplicates.push({ row: row.row, phone: row.phone, error: 'Duplicate phone in this file' });
    else {
      seen.add(key);
      unique.push(row);
    }
  });
  const existing = unique.length === 0
    ? { rows: [] }
    : await db.query(
      'SELECT phone FROM leads WHERE tenant_id = $1 AND phone = ANY($2::text[])',
      [req.tenantId, unique.map((row) => row.phone)]
    );
  const existingPhones = new Set(existing.rows.map((row) => row.phone));
  const alreadyStored = unique.filter((row) => existingPhones.has(row.phone));
  const fresh = unique.filter((row) => !existingPhones.has(row.phone));
  if (req.body?.commit !== true) {
    return res.json({
      preview: true,
      ready: fresh.length,
      invalid,
      file_duplicates: fileDuplicates,
      existing: alreadyStored.map((row) => ({ row: row.row, phone: row.phone, name: row.name })),
      parse_errors: parsed.errors,
    });
  }
  let imported = 0;
  const insertErrors = [];
  for (const row of fresh) {
    try {
      await db.query(
        `INSERT INTO leads (tenant_id, project_id, name, phone, email, inquiry, source, status, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8::jsonb, NOW(), NOW())`,
        [
          req.tenantId,
          row.project_id || null,
          row.name,
          row.phone,
          row.email || null,
          row.inquiry || null,
          row.source,
          JSON.stringify({ imported_from: 'csv', call_initiated: false }),
        ]
      );
      imported += 1;
    } catch (err) {
      insertErrors.push({ row: row.row, error: 'This row was not imported' });
      console.warn('[import] row skipped:', err.message);
    }
  }
  return res.json({
    preview: false,
    imported,
    skipped_existing: alreadyStored.length,
    invalid: [...invalid, ...insertErrors],
    file_duplicates: fileDuplicates,
    existing: alreadyStored.map((row) => ({ row: row.row, phone: row.phone, name: row.name })),
    parse_errors: parsed.errors,
  });
}));

router.post('/leads/:leadId/claim', asyncHandler(async (req, res) => {
  if (!req.tenantId || !req.userId) return res.status(403).json({ error: 'Tenant mismatch' });
  const result = await db.query(
    `UPDATE leads l
     SET assigned_to = p.id,
         updated_at = NOW(),
         metadata = jsonb_set(
           COALESCE(l.metadata, '{}'::jsonb),
           '{assignment_history}',
           COALESCE(l.metadata->'assignment_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'to', p.id,
             'by', $3::text,
             'at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
             'action', 'claim'
           ))
         )
     FROM user_profiles p
     WHERE l.id = $1
       AND l.tenant_id = $2
       AND p.user_id = $3
       AND p.tenant_id = l.tenant_id
       AND p.is_active IS DISTINCT FROM false
       AND l.assigned_to IS NULL
     RETURNING l.id, l.assigned_to`,
    [req.params.leadId, req.tenantId, req.userId]
  );
  if (result.rows.length > 0) return res.json({ status: 'claimed', lead: result.rows[0] });
  const existing = await db.query(
    'SELECT id, assigned_to FROM leads WHERE id = $1 AND tenant_id = $2',
    [req.params.leadId, req.tenantId]
  );
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  return res.status(409).json({ error: 'This lead is already assigned' });
}));

// GET /v1/leads/:tenantId/:leadId
router.get('/leads/:tenantId/:leadId', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.params.tenantId;
  const { leadId } = req.params;
  if (req.tenantId && req.params.tenantId && req.params.tenantId !== req.tenantId) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  const result = await db.query(
    `${LEAD_SELECT} WHERE l.tenant_id = $1 AND l.id = $2
       AND (
         $3::boolean
         OR l.assigned_to IS NULL
         OR l.assigned_to = (SELECT id FROM user_profiles WHERE user_id = $4 AND tenant_id = l.tenant_id LIMIT 1)
       )`,
    [tenantId, leadId, seesAllLeads(req.role), req.userId || null]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  return res.json({ lead: result.rows[0] });
}));

router.get('/leads/:tenantId/:leadId/timeline', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId;
  if (!tenantId || req.params.tenantId !== tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const leadResult = await db.query(
    `${LEAD_SELECT} WHERE l.tenant_id = $1 AND l.id = $2
       AND (
         $3::boolean
         OR l.assigned_to IS NULL
         OR l.assigned_to = (SELECT id FROM user_profiles WHERE user_id = $4 AND tenant_id = l.tenant_id LIMIT 1)
       )`,
    [tenantId, req.params.leadId, seesAllLeads(req.role), req.userId || null]
  );
  if (leadResult.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const lead = leadResult.rows[0];
  const [calls, communications, appointments] = await Promise.all([
    db.query(
      `SELECT id, status, outcome, started_at, created_at FROM calls WHERE tenant_id = $1 AND lead_id = $2 ORDER BY COALESCE(started_at, created_at) DESC LIMIT 50`,
      [tenantId, lead.id]
    ),
    db.query(
      `SELECT id, channel, direction, status, created_at FROM communications WHERE tenant_id = $1 AND lead_id = $2 ORDER BY created_at DESC LIMIT 50`,
      [tenantId, lead.id]
    ),
    db.query(
      `SELECT id, status, scheduled_at, title FROM appointments WHERE tenant_id = $1 AND lead_id = $2 ORDER BY scheduled_at DESC LIMIT 50`,
      [tenantId, lead.id]
    ).catch(() => ({ rows: [] })),
  ]);
  return res.json({
    events: buildTimeline({
      lead,
      calls: calls.rows,
      communications: communications.rows,
      appointments: appointments.rows,
    }),
  });
}));

// GET /v1/leads/by-phone/:tenantId/:phone
router.get('/leads/by-phone/:tenantId/:phone', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.params.tenantId;
  const { phone } = req.params;
  const lead = await getLeadByPhone(tenantId, phone);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  if (!seesAllLeads(req.role)) {
    const profile = await db.query(
      `SELECT id FROM user_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.userId, tenantId]
    );
    if (!canViewLead(req.role, lead, profile.rows[0]?.id)) {
      return res.status(404).json({ error: 'Lead not found' });
    }
  }
  return res.json({ lead });
}));

// PATCH /v1/leads/:leadId
router.patch('/leads/:leadId', asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  const { status, metadata, project_id, projectId, assigned_to, assignedTo } = req.body;

  const updates = [];
  const params = [];
  let i = 1;

  if (status !== undefined) {
    const settingsResult = await db.query('SELECT settings FROM tenants WHERE id = $1', [req.tenantId]);
    if (!isAllowedLeadStatus(status, settingsResult.rows[0]?.settings)) {
      return res.status(400).json({ error: 'Unknown lead status' });
    }
    updates.push(`status = $${i++}`);
    params.push(status);
  }
  if (metadata !== undefined) { updates.push(`metadata = $${i++}`); params.push(JSON.stringify(metadata)); }
  const nextProject = project_id || projectId;
  if (nextProject !== undefined) { updates.push(`project_id = $${i++}`); params.push(nextProject || null); }
  const nextAssignee = assigned_to !== undefined ? assigned_to : assignedTo;
  if (nextAssignee !== undefined && !seesAllLeads(req.role)) {
    const profile = await db.query(
      `SELECT id FROM user_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [req.userId, req.tenantId]
    );
    const current = await db.query(
      `SELECT assigned_to FROM leads WHERE id = $1 AND tenant_id = $2`,
      [leadId, req.tenantId]
    );
    if (current.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
    const profileId = profile.rows[0]?.id || null;
    const owner = current.rows[0].assigned_to;
    const self = profileId && String(nextAssignee) === String(profileId);
    const claiming = !owner && self;
    const keeping = owner && self && String(owner) === String(profileId);
    if (!claiming && !keeping) {
      return res.status(403).json({ error: 'Only a manager can assign this lead' });
    }
  }
  if (nextAssignee !== undefined) { updates.push(`assigned_to = $${i++}`); params.push(nextAssignee || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = NOW()');
  params.push(leadId);
  const tenantFilter = req.tenantId;
  const tenantClause = tenantFilter ? ` AND tenant_id = $${i + 1}` : '';
  if (tenantFilter) params.push(tenantFilter);

  const result = await db.query(
    `UPDATE leads SET ${updates.join(', ')} WHERE id = $${i}${tenantClause} RETURNING *`,
    params
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const updated = result.rows[0];

  if (status !== undefined) {
    await db.query(
      `UPDATE leads
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{status_history}',
         COALESCE(metadata->'status_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'to', $1::text,
           'by', $2::text,
           'at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ))
       )
       WHERE id = $3 AND tenant_id = $4`,
      [status, req.userId || null, leadId, req.tenantId]
    ).catch((err) => console.warn('[leads] status history skipped:', err.message));
  }

  if (nextAssignee !== undefined) {
    await db.query(
      `UPDATE leads
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{assignment_history}',
         COALESCE(metadata->'assignment_history', '[]'::jsonb) || $1::jsonb
       )
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify([{ to: nextAssignee || null, by: req.userId || null, at: new Date().toISOString() }]), leadId, req.tenantId]
    ).catch((err) => console.warn('[leads] assignment history skipped:', err.message));
  }

  if (nextProject && updated.metadata?.needs_project_assignment) {
    const scheduledCallAt = new Date(Date.now() + 60 * 1000).toISOString();
    await db.query(
      `UPDATE leads
       SET metadata = COALESCE(metadata, '{}') || $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND tenant_id = COALESCE($3, tenant_id)`,
      [JSON.stringify({
        needs_project_assignment: false,
        scheduled_call_at: scheduledCallAt,
        project_assignment_reason: 'assigned',
      }), leadId, req.tenantId || null]
    ).catch(() => {});
    if (!updated.metadata?.call_initiated) {
      await enqueueCall({
        tenantId: updated.tenant_id,
        projectId: nextProject,
        leadId,
        priority: 5,
        scheduledAt: scheduledCallAt,
      }).catch((err) => console.warn('[leads] enqueue after project assign failed:', err.message));
    }
  }

  return res.json({ status: 'updated', lead: updated });
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
     WHERE id = $2 AND tenant_id = COALESCE($3, tenant_id)`,
    [JSON.stringify([note]), leadId, req.tenantId || null]
  );
  return res.json({ status: 'added', note });
}));

// DELETE /v1/leads/:leadId/notes/:noteId — remove a note
router.delete('/leads/:leadId/notes/:noteId', asyncHandler(async (req, res) => {
  const { leadId, noteId } = req.params;
  const lead = await db.query(
    'SELECT metadata FROM leads WHERE id = $1 AND tenant_id = COALESCE($2, tenant_id)',
    [leadId, req.tenantId || null]
  );
  if (lead.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });
  const notes = (lead.rows[0].metadata?.notes || []).filter((n) => n.id !== noteId);
  await db.query(
    `UPDATE leads SET metadata = jsonb_set(COALESCE(metadata,'{}'), '{notes}', $1::jsonb), updated_at = NOW() WHERE id = $2 AND tenant_id = COALESCE($3, tenant_id)`,
    [JSON.stringify(notes), leadId, req.tenantId || null]
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

// GET /v1/analytics/conversion?tenantId=
router.get('/analytics/conversion', asyncHandler(async (req, res) => {
  const tenantId = req.tenantId || req.query.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const leads = await db.query(`${LEAD_SELECT} WHERE l.tenant_id = $1`, [tenantId]);
  const tenant = await db.query(`SELECT settings FROM tenants WHERE id = $1`, [tenantId]);
  const averageDealValue = tenant.rows[0]?.settings?.average_deal_value ?? null;
  const conversion = buildConversionMetrics(leads.rows, { averageDealValue });
  return res.json({ conversion, averageDealValue });
}));

module.exports = router;
