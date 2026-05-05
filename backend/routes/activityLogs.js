/**
 * Activity Logs routes (Phase 7)
 *
 * GET /v1/activity?tenantId=&projectId=&limit=&offset=
 * POST /v1/activity  — internal log write
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// GET /v1/activity
router.get('/activity', asyncHandler(async (req, res) => {
  const { tenantId, projectId, limit = 50, offset = 0 } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  let query = `
    SELECT al.*, up.full_name as user_name, p.name as project_name
    FROM activity_logs al
    LEFT JOIN user_profiles up ON up.user_id = al.user_id AND up.tenant_id = al.tenant_id
    LEFT JOIN projects p ON p.id = al.project_id
    WHERE al.tenant_id = $1
  `;
  const params = [tenantId];

  if (projectId) {
    params.push(projectId);
    query += ` AND al.project_id = $${params.length}`;
  }

  query += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(Number(limit), Number(offset));

  const result = await db.query(query, params);

  const countResult = await db.query(
    `SELECT COUNT(*) FROM activity_logs WHERE tenant_id = $1${projectId ? ' AND project_id = $2' : ''}`,
    projectId ? [tenantId, projectId] : [tenantId]
  );

  return res.json({
    logs: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
  });
}));

// POST /v1/activity — internal log write
router.post('/activity', asyncHandler(async (req, res) => {
  const { tenantId, projectId, userId, actionType, entityType, entityId, metadata } = req.body;

  if (!tenantId || !actionType) {
    return res.status(400).json({ error: 'tenantId and actionType are required' });
  }

  const result = await db.query(
    `INSERT INTO activity_logs (tenant_id, project_id, user_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [tenantId, projectId || null, userId || null, actionType, entityType || null, entityId || null, JSON.stringify(metadata || {})]
  );

  return res.json({ id: result.rows[0].id });
}));

module.exports = router;
