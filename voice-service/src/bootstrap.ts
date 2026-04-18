import dotenv from 'dotenv';
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

/** Prefer `.env` next to `dist/` so PM2/cwd quirks still load secrets (e.g. VOICE_SECRET). */
function loadEnv(): void {
  const besideDist = path.resolve(__dirname, '..', '.env');
  const cwdEnv = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(besideDist)) dotenv.config({ path: besideDist });
  else if (fs.existsSync(cwdEnv)) dotenv.config({ path: cwdEnv });
  else dotenv.config();
}
loadEnv();

// GCP VMs often have no IPv6 route; Supabase hostnames may resolve AAAA first → ENETUNREACH on :5432
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
