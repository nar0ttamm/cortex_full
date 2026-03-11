const { Pool } = require('pg');

// Lazy initialization of pool to prevent startup failures
let pool = null;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Supabase
      },
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
  }
};

