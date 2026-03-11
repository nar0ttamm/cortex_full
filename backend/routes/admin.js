const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { encryptCredentials } = require('../encryption');
const config = require('../config');

const router = Router();

// Simple admin token guard
function requireAdminToken(req, res, next) {
  if (!config.adminToken) return next(); // No token configured → open in dev
  const token = req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }
  return next();
}

// GET /v1/tenant/:tenantId — fetch tenant profile (public, no auth needed)
router.get('/tenant/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const result = await db.query(
    'SELECT id, name, slug, status, settings, created_at FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
  res.json({ tenant: result.rows[0] });
}));

// PATCH /v1/tenant/:tenantId — update tenant name + settings fields
router.patch('/tenant/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { name, settings } = req.body;

  const existing = await db.query('SELECT id, name, settings FROM tenants WHERE id = $1', [tenantId]);
  if (existing.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

  const merged = { ...(existing.rows[0].settings || {}), ...(settings || {}) };
  const newName = name || existing.rows[0].name;

  const result = await db.query(
    `UPDATE tenants SET name = $1, settings = $2 WHERE id = $3
     RETURNING id, name, slug, status, settings`,
    [newName, JSON.stringify(merged), tenantId]
  );
  res.json({ tenant: result.rows[0] });
}));

// POST /v1/admin/tenant
router.post('/admin/tenant', requireAdminToken, asyncHandler(async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Missing required fields: name, slug' });

  const existing = await db.query('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Tenant with this slug already exists' });

  const result = await db.query(
    `INSERT INTO tenants (name, slug, status, settings, created_at)
     VALUES ($1, $2, 'active', $3, NOW())
     RETURNING id, name, slug, status, created_at`,
    [name, slug, JSON.stringify({})]
  );

  return res.status(201).json({ status: 'created', tenant: result.rows[0] });
}));

// POST /v1/admin/credentials
router.post('/admin/credentials', requireAdminToken, asyncHandler(async (req, res) => {
  const { tenant_id, service, credentials } = req.body;
  if (!tenant_id || !service || !credentials) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, service, credentials' });
  }

  const encryptedData = encryptCredentials(credentials);

  const result = await db.query(
    `INSERT INTO credentials (tenant_id, service, encrypted_data, is_active, created_at)
     VALUES ($1, $2, $3, true, NOW())
     ON CONFLICT (tenant_id, service)
     DO UPDATE SET encrypted_data = $3, is_active = true
     RETURNING id, tenant_id, service, created_at`,
    [tenant_id, service, encryptedData]
  );

  return res.status(201).json({ status: 'created', credential: result.rows[0] });
}));

// DELETE /v1/admin/credentials/:tenantId/:service
router.delete('/admin/credentials/:tenantId/:service', requireAdminToken, asyncHandler(async (req, res) => {
  const { tenantId, service } = req.params;
  const result = await db.query(
    'DELETE FROM credentials WHERE tenant_id = $1 AND service = $2 RETURNING id, service',
    [tenantId, service]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Credential not found' });
  return res.json({ status: 'deleted', credential: result.rows[0] });
}));

module.exports = router;
