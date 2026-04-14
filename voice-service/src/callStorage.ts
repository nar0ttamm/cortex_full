import { Pool, type PoolConfig } from 'pg';
import dns from 'node:dns/promises';
// default export is `parse`; helpers are attached (parseIntoClientConfig)
import connParse from 'pg-connection-string';

/** Last URL we built a pool for — invalidates pool when .env / env changes (e.g. after deploy). */
let poolUrlSeen = '';

let poolPromise: Promise<Pool> | null = null;

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Prefer IPv4 so GCP VMs without IPv6 route do not hit ENETUNREACH on AAAA. */
async function resolveFirstIpv4(host: string): Promise<string | null> {
  if (isIpv4Literal(host)) return host;
  try {
    const r = await dns.lookup(host, { family: 4 });
    return r.address;
  } catch {
    try {
      const addrs = await dns.resolve4(host);
      return addrs[0] ?? null;
    } catch {
      return null;
    }
  }
}

async function getPool(): Promise<Pool> {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  if (dbUrl !== poolUrlSeen) {
    poolUrlSeen = dbUrl;
    poolPromise = null;
  }

  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const useSsl =
      dbUrl.includes('supabase.co') ||
      dbUrl.includes('supabase.com') ||
      process.env.DATABASE_SSL === 'true';

    const clientConfig = connParse.parseIntoClientConfig(dbUrl) as PoolConfig;
    const host = clientConfig.host;
    if (!host) {
      throw new Error('DATABASE_URL has no host');
    }

    // Direct db.* host is IPv6-first; no A record on many projects → IPv4-only VMs cannot connect.
    if (host.startsWith('db.') && host.includes('supabase.co') && !host.includes('pooler')) {
      throw new Error(
        `DATABASE_URL uses direct host "${host}" (IPv6-first). On GCP use the pooler URI from Supabase Dashboard → Connect ` +
          `(Session or Transaction, *.pooler.supabase.com), or enable the IPv4 add-on for direct access.`
      );
    }

    const isPooler = host.includes('pooler.supabase.com');
    let connectHost = host;
    let ssl: PoolConfig['ssl'] | undefined;

    if (useSsl) {
      ssl = { rejectUnauthorized: false };
    }

    if (!isIpv4Literal(host) && !host.includes(':')) {
      const v4 = await resolveFirstIpv4(host);
      if (v4) {
        connectHost = v4;
        if (isPooler && ssl && typeof ssl === 'object') {
          ssl = { ...ssl, servername: host };
        }
      } else if (isPooler) {
        // Do not pass hostname through to pg on IPv4-only VMs: DNS may prefer AAAA → ENETUNREACH.
        throw new Error(
          `Could not resolve "${host}" to IPv4. Check VM DNS/outbound UDP 53 and DATABASE_URL (Session pooler URI).`
        );
      } else {
        throw new Error(
          `No IPv4 address for "${host}". Use Supabase pooler host (*.pooler.supabase.com) in DATABASE_URL.`
        );
      }
    }

    console.log('[callStorage] postgres connect host:', connectHost === host ? host : `${connectHost} (SNI ${host})`);

    return new Pool({
      user: clientConfig.user,
      password: clientConfig.password,
      host: connectHost,
      port: clientConfig.port ?? 5432,
      database: clientConfig.database ?? undefined,
      ssl,
      application_name: clientConfig.application_name,
      max: 10,
      connectionTimeoutMillis: 12000,
      idleTimeoutMillis: 30000,
    });
  })();

  return poolPromise;
}

const QUERY_MS = 15000;

async function queryWithTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${QUERY_MS}ms`)), QUERY_MS)
    ),
  ]);
}

interface CreateCallParams {
  id: string;
  tenant_id: string;
  lead_id: string;
  phone: string;
  status: string;
}

interface SaveResultParams {
  call_id: string;
  transcript: string;
  summary: string;
  duration_seconds: number;
  outcome: string;
}

export const callStorage = {
  async createCall(params: CreateCallParams) {
    const pool = await getPool();
    const { id, tenant_id, lead_id, phone, status } = params;
    await queryWithTimeout('createCall', () =>
      pool.query(
        `INSERT INTO calls (id, tenant_id, lead_id, phone, status, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [id, tenant_id, lead_id, phone, status]
      )
    );
  },

  async getCall(callId: string) {
    const pool = await getPool();
    const result = await pool.query('SELECT * FROM calls WHERE id = $1', [callId]);
    return result.rows[0] || null;
  },

  async updateCallStatus(callId: string, status: string, error?: string) {
    const pool = await getPool();
    await pool.query(
      `UPDATE calls SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
      [status, error || null, callId]
    );
  },

  async saveCallResult(params: SaveResultParams) {
    const pool = await getPool();
    const { call_id, transcript, summary, duration_seconds, outcome } = params;

    await pool.query(
      `UPDATE calls 
       SET status = 'completed', duration_seconds = $1, outcome = $2, ended_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [duration_seconds, outcome, call_id]
    );

    await pool.query(
      `INSERT INTO call_transcripts (call_id, full_transcript, summary, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (call_id) DO UPDATE SET full_transcript = $2, summary = $3`,
      [call_id, transcript, summary]
    );

    await pool.query(
      `INSERT INTO call_events (call_id, event_type, event_data, created_at)
       VALUES ($1, 'call_completed', $2, NOW())`,
      [call_id, JSON.stringify({ outcome, duration_seconds })]
    );
  },

  async logEvent(callId: string, eventType: string, data: object) {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO call_events (call_id, event_type, event_data, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [callId, eventType, JSON.stringify(data)]
    );
  },
};
