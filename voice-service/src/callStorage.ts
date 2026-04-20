import { Pool, type PoolConfig } from 'pg';
import dns from 'node:dns/promises';
// default export is `parse`; helpers are attached (parseIntoClientConfig)
import connParse from 'pg-connection-string';

const dbUrl = process.env.DATABASE_URL || '';
const useSsl =
  dbUrl.includes('supabase.co') || dbUrl.includes('supabase.com') || process.env.DATABASE_SSL === 'true';

let poolPromise: Promise<Pool> | null = null;

function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

async function getPool(): Promise<Pool> {
  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const clientConfig = connParse.parseIntoClientConfig(dbUrl) as PoolConfig;
    const host = clientConfig.host;
    if (!host) {
      throw new Error('DATABASE_URL has no host');
    }

    let connectHost = host;
    if (!isIpv4Literal(host) && !host.includes(':')) {
      try {
        const v4 = await dns.resolve4(host);
        if (!v4?.length) {
          throw new Error('resolve4 returned no addresses');
        }
        connectHost = v4[0];
      } catch (e) {
        throw new Error(
          `No IPv4 (A record) for DB host "${host}": ${(e as Error).message}. ` +
            `Use Supabase "Session pooler" / Transaction pool connection string (port 6543), or fix DNS.`
        );
      }
    }

    if (useSsl) {
      clientConfig.ssl = { rejectUnauthorized: false };
    }

    return new Pool({
      user: clientConfig.user,
      password: clientConfig.password,
      host: connectHost,
      port: clientConfig.port ?? 5432,
      database: clientConfig.database ?? undefined,
      ssl: clientConfig.ssl,
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
  appointment_requested?: boolean;
  proposed_appointment_iso?: string | null;
}

interface UpdateLeadParams {
  lead_id: string;
  outcome: string;
  appointment_requested: boolean;
  proposed_appointment_iso?: string | null;
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
    const { call_id, transcript, summary, duration_seconds, outcome, appointment_requested, proposed_appointment_iso } =
      params;

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
      [
        call_id,
        JSON.stringify({
          outcome,
          duration_seconds,
          appointment_requested: appointment_requested ?? false,
          proposed_appointment_iso: proposed_appointment_iso ?? null,
        }),
      ]
    );
  },

  /**
   * Update lead metadata and status after a call completes.
   * - Always marks ai_call_status = 'called'
   * - If appointment booked: sets appointment_date + appointment_status = 'Scheduled'
   *   and promotes lead status to 'appointment'
   * - If interested (no appt): promotes 'new' leads to 'contacted'
   */
  async updateLeadAfterCall(params: UpdateLeadParams) {
    if (!params.lead_id) return;
    const pool = await getPool();
    const { lead_id, outcome, appointment_requested, proposed_appointment_iso } = params;

    const metaPatch: Record<string, string> = { ai_call_status: 'called' };
    let statusClause = '';

    if (appointment_requested && proposed_appointment_iso) {
      metaPatch.appointment_date  = proposed_appointment_iso;
      metaPatch.appointment_status = 'Scheduled';
      // Promote status to 'appointment' unless it's already at a later stage
      statusClause = `, status = CASE WHEN status IN ('new','contacted','qualified') THEN 'appointment' ELSE status END`;
    } else if (outcome === 'interested') {
      statusClause = `, status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END`;
    }

    await queryWithTimeout('updateLeadAfterCall', () =>
      pool.query(
        `UPDATE leads
         SET metadata   = COALESCE(metadata, '{}') || $2::jsonb,
             updated_at = NOW()${statusClause}
         WHERE id = $1`,
        [lead_id, JSON.stringify(metaPatch)]
      )
    );
  },

  async getTenantName(tenantId: string): Promise<string> {
    if (!tenantId) return '';
    try {
      const pool = await getPool();
      const result = await queryWithTimeout('getTenantName', () =>
        pool.query('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [tenantId])
      );
      return (result.rows[0]?.name as string) || '';
    } catch {
      return '';
    }
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
