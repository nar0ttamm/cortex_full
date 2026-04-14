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
