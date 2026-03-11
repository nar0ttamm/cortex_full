const db = require('../db');
const { decryptCredentials } = require('../encryption');

/**
 * Fetches and decrypts stored credentials for a tenant + service combination.
 * Throws if credentials are not found or decryption fails.
 */
async function getCredentials(tenantId, service) {
  const result = await db.query(
    'SELECT encrypted_data FROM credentials WHERE tenant_id = $1 AND service = $2 AND is_active = true',
    [tenantId, service]
  );

  if (result.rows.length === 0) {
    throw new Error(`Credentials not found for service: ${service} (tenant: ${tenantId})`);
  }

  return decryptCredentials(result.rows[0].encrypted_data);
}

module.exports = { getCredentials };
