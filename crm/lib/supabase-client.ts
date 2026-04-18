// Backend API client for leads (CRM talks to Backend API, not Supabase directly).
// File name kept as supabase-client for minimal change to existing imports.

const API_URL = process.env.NEXT_PUBLIC_API_URL;
if (!API_URL && typeof window === 'undefined') {
  console.warn('[supabase-client] NEXT_PUBLIC_API_URL is not set. Set it in .env.local or use vercel dev.');
}

async function fetchApi(path: string, options?: RequestInit) {
  const base = API_URL?.replace(/\/$/, '') || '';
  if (!base) throw new Error('NEXT_PUBLIC_API_URL is not set');

  // 15s timeout — prevents Vercel's 10s function limit from silently killing requests
  // and surfaces a clean error instead of an opaque 504/500.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(base + path, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || 'HTTP ' + res.status);
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Backend request timed out. Please retry.');
    throw err;
  }
}

// Flatten metadata fields to top-level so the Lead type (which predates metadata nesting) works correctly
function flattenLead(lead: any): any {
  const m = lead?.metadata || {};
  const callInit = m.call_initiated;
  const callInitiated =
    callInit === true || callInit === 'true' || String(callInit).toLowerCase() === 'true';

  return {
    ...lead,
    call_transcript: m.call_transcript ?? lead.call_transcript ?? null,
    call_result: m.call_result ?? lead.call_result ?? null,
    appointment_requested:
      m.appointment_requested === true || String(m.appointment_requested).toLowerCase() === 'true'
        ? true
        : undefined,
    ai_call_status: m.ai_call_status ?? lead.ai_call_status ?? null,
    appointment_status: m.appointment_status ?? lead.appointment_status ?? null,
    appointment_date: m.appointment_date ?? lead.appointment_date ?? null,
    reminder_1day_sent: m.reminder_1day_sent ?? lead.reminder_1day_sent ?? false,
    reminder_3hr_sent: m.reminder_3hr_sent ?? lead.reminder_3hr_sent ?? false,
    scheduled_call_at: m.scheduled_call_at ?? null,
    call_initiated: callInitiated,
    active_call: m.active_call ?? null,
    timestamp: lead.created_at ?? lead.timestamp,
    last_update: lead.updated_at ?? lead.last_update,
  };
}

export async function getLeadsFromSupabase(tenantId?: string): Promise<any[]> {
  if (!tenantId) throw new Error('tenantId is required');
  const data = await fetchApi('/v1/leads/' + tenantId);
  return (data.leads ?? []).map(flattenLead);
}

export async function getLeadFromSupabase(id: string, tenantId: string): Promise<any> {
  const data = await fetchApi('/v1/leads/' + tenantId + '/' + id);
  return flattenLead(data.lead);
}

export async function createLeadInSupabase(
  lead: { name: string; phone: string; email?: string; inquiry?: string; source?: string },
  tenantId?: string
): Promise<void> {
  const tid = tenantId || (lead as any).tenant_id;
  if (!tid) throw new Error('tenantId is required');
  await fetchApi('/v1/lead/ingest', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: tid,
      name: lead.name,
      phone: lead.phone,
      email: lead.email ?? undefined,
      inquiry: lead.inquiry ?? undefined,
      source: lead.source ?? 'CRM',
    }),
  });
}

export async function updateLeadInSupabase(
  leadId: string,
  updates: { status?: string; metadata?: Record<string, unknown>; [k: string]: unknown }
): Promise<void> {
  await fetchApi('/v1/leads/' + leadId, {
    method: 'PATCH',
    body: JSON.stringify({
      status: updates.status,
      metadata: updates.metadata,
    }),
  });
}
