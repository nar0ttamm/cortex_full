/**
 * Knowledge Base routes (Phase 9)
 *
 * GET  /v1/kb?tenantId=&type=tenant|project&projectId=
 * POST /v1/kb
 * PATCH /v1/kb/:id
 *
 * Products:
 * GET  /v1/kb/products?projectId=&tenantId=
 * POST /v1/kb/products
 * PATCH /v1/kb/products/:id
 * DELETE /v1/kb/products/:id
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// GET /v1/kb
router.get('/kb', asyncHandler(async (req, res) => {
  const { tenantId, type, projectId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  let query = `SELECT * FROM knowledge_bases WHERE tenant_id = $1`;
  const params = [tenantId];

  if (type) {
    params.push(type);
    query += ` AND type = $${params.length}`;
  }
  if (projectId) {
    params.push(projectId);
    query += ` AND project_id = $${params.length}`;
  }

  const result = await db.query(query + ' ORDER BY created_at DESC', params);
  return res.json({ kbs: result.rows });
}));

// POST /v1/kb
router.post('/kb', asyncHandler(async (req, res) => {
  const { tenantId, projectId, type = 'tenant', title, brandVoice, callingRules, companyInstructions, customContent } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `INSERT INTO knowledge_bases (tenant_id, project_id, type, title, brand_voice, calling_rules, company_instructions, custom_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, projectId || null, type, title || null, brandVoice || null, callingRules || null, companyInstructions || null, JSON.stringify(customContent || {})]
  );

  return res.json({ kb: result.rows[0] });
}));

// PATCH /v1/kb/:id
router.patch('/kb/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId, title, brandVoice, callingRules, companyInstructions, customContent } = req.body;

  const result = await db.query(
    `UPDATE knowledge_bases
     SET title = COALESCE($1, title),
         brand_voice = COALESCE($2, brand_voice),
         calling_rules = COALESCE($3, calling_rules),
         company_instructions = COALESCE($4, company_instructions),
         custom_content = COALESCE($5, custom_content),
         updated_at = now()
     WHERE id = $6 AND tenant_id = $7
     RETURNING *`,
    [title, brandVoice, callingRules, companyInstructions, customContent ? JSON.stringify(customContent) : null, id, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'KB not found' });
  return res.json({ kb: result.rows[0] });
}));

// GET /v1/kb/products?projectId=&tenantId=
router.get('/kb/products', asyncHandler(async (req, res) => {
  const { tenantId, projectId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  let query = `SELECT * FROM kb_products WHERE tenant_id = $1 AND is_active = true`;
  const params = [tenantId];

  if (projectId) {
    params.push(projectId);
    query += ` AND project_id = $${params.length}`;
  }

  const result = await db.query(query + ' ORDER BY created_at ASC', params);
  return res.json({ products: result.rows });
}));

// POST /v1/kb/products
router.post('/kb/products', asyncHandler(async (req, res) => {
  const { tenantId, projectId, name, propertyType, location, priceRange, size, possessionStatus, amenities, extraDetails } = req.body;

  if (!tenantId || !projectId || !name) {
    return res.status(400).json({ error: 'tenantId, projectId, name are required' });
  }

  const result = await db.query(
    `INSERT INTO kb_products (project_id, tenant_id, name, property_type, location, price_range, size, possession_status, amenities, extra_details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [projectId, tenantId, name.trim(), propertyType || null, location || null, priceRange || null, size || null, possessionStatus || null, amenities || null, JSON.stringify(extraDetails || {})]
  );

  return res.json({ product: result.rows[0] });
}));

// PATCH /v1/kb/products/:id
router.patch('/kb/products/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId, name, propertyType, location, priceRange, size, possessionStatus, amenities } = req.body;

  const result = await db.query(
    `UPDATE kb_products
     SET name = COALESCE($1, name),
         property_type = COALESCE($2, property_type),
         location = COALESCE($3, location),
         price_range = COALESCE($4, price_range),
         size = COALESCE($5, size),
         possession_status = COALESCE($6, possession_status),
         amenities = COALESCE($7, amenities),
         updated_at = now()
     WHERE id = $8 AND tenant_id = $9
     RETURNING *`,
    [name, propertyType, location, priceRange, size, possessionStatus, amenities, id, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Product not found' });
  return res.json({ product: result.rows[0] });
}));

// DELETE /v1/kb/products/:id
router.delete('/kb/products/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.query;

  await db.query(
    `UPDATE kb_products SET is_active = false WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  return res.json({ success: true });
}));

module.exports = router;
