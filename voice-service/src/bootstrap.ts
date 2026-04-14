import path from 'path';
import dotenv from 'dotenv';
import dns from 'node:dns';
import connParse from 'pg-connection-string';

// Load .env from app root (next to dist/), not process.cwd() — PM2 cwd is often wrong so dotenv missed the file.
const envPath = path.resolve(__dirname, '..', '.env');
const loaded = dotenv.config({ path: envPath, override: true });
if (loaded.error) {
  console.warn('[bootstrap] dotenv:', loaded.error.message, '(tried', envPath + ')');
} else {
  try {
    const cfg = connParse.parseIntoClientConfig(process.env.DATABASE_URL || '') as { host?: string };
    console.log('[bootstrap] DATABASE_URL host:', cfg.host || '(missing)');
  } catch {
    console.log('[bootstrap] DATABASE_URL could not be parsed');
  }
}

// GCP VMs often have no IPv6 route; Supabase hostnames may resolve AAAA first → ENETUNREACH on :5432
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
