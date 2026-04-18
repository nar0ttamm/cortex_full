import type { ActiveCallMeta } from '@/types';

export type { ActiveCallMeta };

/** Human-readable labels for `calls.status` and live `active_call.phase` values */

export function labelForCallDbStatus(status: string | undefined | null): string {
  const s = (status || '').toLowerCase();
  const map: Record<string, string> = {
    initiating: 'Connecting…',
    dialing: 'Connecting…',
    ringing: 'Ringing…',
    answered: 'Answered',
    active: 'Call in progress',
    completed: 'Completed',
    failed: 'Failed',
    ended: 'Ended',
  };
  return map[s] || status || '—';
}

export function formatCountdownSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** True while a row in `calls` is not in a final state */
export function isCallStatusLive(status: string | undefined | null): boolean {
  const s = (status || '').toLowerCase();
  return ['initiating', 'ringing', 'answered', 'active'].includes(s);
}

