const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';

export type CallRow = {
  id: string;
  tenant_id: string;
  lead_id: string;
  phone: string;
  status: string;
  error_message?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  created_at: string;
  updated_at?: string;
  lead_name?: string | null;
  lead_phone?: string | null;
  summary?: string | null;
  full_transcript?: string | null;
};

function trimId(id: string): string {
  return id.trim();
}

export async function fetchCallsForTenant(
  tenantId: string,
  opts?: { limit?: number; status?: string; leadId?: string }
): Promise<{ calls: CallRow[]; count: number }> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

  const q = new URLSearchParams();
  if (opts?.limit) q.set('limit', String(opts.limit));
  if (opts?.status) q.set('status', opts.status);
  if (opts?.leadId) q.set('lead_id', trimId(opts.leadId));

  const url = `${API_URL}/v1/calls/${trimId(tenantId)}${q.toString() ? `?${q}` : ''}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function startAiCall(tenantId: string, leadId: string): Promise<{ call_id: string }> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL is not set');

  const tid = trimId(tenantId);
  const lid = trimId(leadId);
  const res = await fetch(`${API_URL}/v1/calls/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: tid, lead_id: lid }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error ||
      data.details?.error ||
      (typeof data.details === 'string' ? data.details : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
