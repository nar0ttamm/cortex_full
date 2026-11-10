const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../db');

const router = Router();

// GET /v1/credentials/:tenantId/:service
// Confirms that a credential exists. Never returns the decrypted secret.
router.get('/credentials/:tenantId/:service', asyncHandler(async (req, res) => {
  if (req.role !== 'admin' && req.role !== 'manager') {
    return res.status(403).json({ error: 'Only admins and managers can view credential status' });
  }
  const { tenantId, service } = req.params;
  const result = await db.query(
    `SELECT service, is_active, created_at
     FROM credentials
     WHERE tenant_id = $1 AND service = $2
     LIMIT 1`,
    [tenantId, service]
  );
  const row = result.rows[0];
  return res.json({
    service,
    configured: Boolean(row && row.is_active !== false),
    created_at: row?.created_at || null,
  });
}));

module.exports = router;
