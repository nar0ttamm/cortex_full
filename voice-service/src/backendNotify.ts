/**
 * Notify Vercel/backend so CRM lead metadata stays in sync (dial failures, call results).
 */
export async function notifyBackendCallResult(payload: {
  tenant_id: string;
  lead_id: string;
  call_id: string;
  outcome: string;
  transcript?: string;
  summary?: string;
  duration_seconds?: number;
  appointment_requested?: boolean;
  proposed_appointment_iso?: string | null;
}): Promise<void> {
  const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');
  if (!backendUrl) return;

  const body = {
    tenant_id: payload.tenant_id,
    lead_id: payload.lead_id,
    call_id: payload.call_id,
    outcome: payload.outcome,
    transcript: payload.transcript ?? '',
    summary: payload.summary ?? '',
    duration_seconds: payload.duration_seconds ?? 0,
    appointment_requested: payload.appointment_requested ?? false,
    proposed_appointment_iso: payload.proposed_appointment_iso ?? null,
  };

  await fetch(`${backendUrl}/v1/calls/result`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-voice-secret': process.env.VOICE_SECRET || '',
    },
    body: JSON.stringify(body),
  }).catch((e: Error) => console.error('[backendNotify]', e.message));
}

/** Mid-call phase (e.g. answered). Extend backend with a dedicated route when CRM live status is needed. */
export async function notifyBackendCallEvent(payload: {
  tenant_id: string;
  lead_id: string;
  call_id: string;
  phase: string;
}): Promise<void> {
  if (!process.env.BACKEND_URL?.trim()) {
    console.log('[backendNotify:event]', payload.call_id, payload.phase);
    return;
  }
  console.log('[backendNotify:event]', payload.call_id, payload.phase, 'lead=', payload.lead_id);
}
