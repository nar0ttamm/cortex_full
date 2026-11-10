const fs = require('fs');
const path = require('path');
const tls = require('tls');
const { Pool } = require('pg');

function sslConfig() {
  if (process.env.DATABASE_SSL === 'disable') return false;
  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  if (!rejectUnauthorized) return { rejectUnauthorized: false };
  // Supabase pooler presents a chain rooted at Supabase Root 2021 CA, which is
  // not in the public trust store. The file is the published CA and matches the
  // live chain. Public CAs stay trusted for any non-pooler host.
  const supabaseRoot = fs.readFileSync(path.join(__dirname, 'certs', 'prod-ca-2021.crt'));
  return {
    rejectUnauthorized: true,
    ca: [...tls.rootCertificates, supabaseRoot.toString()],
  };
}

// Lazy initialization of pool to prevent startup failures
let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
      max: 1, // Vercel serverless: minimize connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }
  return pool;
}

module.exports = {
  query: (text, params) => getPool().query(text, params),
  get pool() {
    return getPool();
  },
  /** Use for multi-step routes that need `BEGIN` / `COMMIT` (e.g. idempotent webhooks). */
  getPool,
};

