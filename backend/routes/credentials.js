const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { getCredentials } = require('../services/credentialService');

const router = Router();

// GET /v1/credentials/:tenantId/:service
router.get('/credentials/:tenantId/:service', asyncHandler(async (req, res) => {
  const { tenantId, service } = req.params;
  const credentials = await getCredentials(tenantId, service);
  return res.json({ service, credentials });
}));

module.exports = router;
