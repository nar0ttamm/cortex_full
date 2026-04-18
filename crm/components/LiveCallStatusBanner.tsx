'use client';

import type { ActiveCallMeta } from '@/types';

type Props = {
  activeCall?: ActiveCallMeta | null;
  /** Latest call row from API (fallback when active_call not yet merged) */
  latestCallStatus?: string | null;
  className?: string;
};

function isLiveDbStatus(s: string): boolean {
  return ['initiating', 'ringing', 'answered', 'active'].includes(s.toLowerCase());
}

function dbStatusLabel(s: string): string {
  const x = s.toLowerCase();
  if (x === 'initiating') return 'Connecting…';
  if (x === 'ringing') return 'Ringing…';
  if (x === 'answered') return 'Call answered';
  if (x === 'active') return 'Call in progress';
  return s;
}

function phaseFallbackLabel(phase: string): string {
  const p = phase.toLowerCase();
  const m: Record<string, string> = {
    dialing: 'Dialing…',
    ringing: 'Ringing…',
    answered: 'Call answered',
    ongoing: 'Call in progress',
    initiating: 'Connecting…',
  };
  return m[p] || phase;
}

/**
 * Prominent strip for in-flight call phases (ringing → answered → ongoing).
 */
export function LiveCallStatusBanner({ activeCall, latestCallStatus, className = '' }: Props) {
  const text =
    activeCall?.label ||
    (activeCall?.phase ? phaseFallbackLabel(activeCall.phase) : '') ||
    (latestCallStatus && isLiveDbStatus(latestCallStatus) ? dbStatusLabel(latestCallStatus) : '');

  if (!text) return null;

  const detail = activeCall?.detail;
  const phaseKey = (activeCall?.phase || latestCallStatus || '').toLowerCase();

  const bar =
    phaseKey === 'ringing'
      ? 'bg-amber-500'
      : phaseKey === 'answered'
        ? 'bg-emerald-500'
        : phaseKey === 'ongoing' || phaseKey === 'active'
          ? 'bg-teal-500'
          : phaseKey === 'dialing' || phaseKey === 'initiating'
            ? 'bg-sky-500'
            : 'bg-violet-500';

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm ${className}`}
    >
      <div className={`h-1 ${bar} animate-pulse`} />
      <div className="px-4 py-3 flex items-start gap-3">
        <span className="relative flex h-3 w-3 mt-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{text}</p>
          {detail ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={detail}>
              {detail}
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400 mt-1">Live · refreshes automatically</p>
        </div>
      </div>
    </div>
  );
}
