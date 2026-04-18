/**
 * If `scheduled_call_at` is unreasonably far from lead creation (e.g. legacy 300s tenant delay),
 * treat the UI countdown as 60s from creation so the timer matches product intent.
 */
export function getEffectiveScheduledCallAt(lead: {
  timestamp?: string;
  scheduled_call_at?: string | null;
  metadata?: Record<string, unknown>;
}): string | null {
  const m = lead.metadata;
  const raw =
    lead.scheduled_call_at ??
    (typeof m?.scheduled_call_at === 'string' ? m.scheduled_call_at : null) ??
    null;
  if (!raw) return null;
  const ts = lead.timestamp ?? (lead as { created_at?: string }).created_at;
  if (!ts) return raw;
  const createdMs = new Date(ts).getTime();
  const schedMs = new Date(raw).getTime();
  if (!Number.isFinite(createdMs) || !Number.isFinite(schedMs)) return raw;
  if (schedMs - createdMs > 90_000) {
    return new Date(createdMs + 60_000).toISOString();
  }
  return raw;
}
