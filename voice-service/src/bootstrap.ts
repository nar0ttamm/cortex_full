import dotenv from 'dotenv';
import dns from 'node:dns';

dotenv.config();

// GCP VMs often have no IPv6 route; Supabase hostnames may resolve AAAA first → ENETUNREACH on :5432
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
