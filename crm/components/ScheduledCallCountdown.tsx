'use client';

import { memo, useEffect, useState } from 'react';
import { formatCountdownSeconds } from '@/lib/callStatusUi';

type Props = {
  /** ISO timestamp when the outbound AI call should start */
  scheduledAtIso: string;
  /** Stop showing countdown after this is true */
  callInitiated: boolean;
  /** Table / list row */
  compact?: boolean;
  className?: string;
};

/**
 * Live MM:SS countdown until scheduled_call_at. Shows total seconds in a subtitle.
 */
function ScheduledCallCountdownInner({
  scheduledAtIso,
  callInitiated,
  compact = false,
  className = '',
}: Props) {
  const [remainSec, setRemainSec] = useState<number | null>(null);

  useEffect(() => {
    if (callInitiated || !scheduledAtIso) {
      setRemainSec(null);
      return;
    }

    const target = new Date(scheduledAtIso).getTime();
    const tick = () => {
      const ms = target - Date.now();
      setRemainSec(Math.max(0, Math.ceil(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [scheduledAtIso, callInitiated]);

  if (callInitiated || remainSec === null) return null;
  if (remainSec <= 0) {
    if (compact) {
      return (
        <span className={`text-[11px] font-medium text-amber-600 dark:text-amber-400 ${className}`}>Starting…</span>
      );
    }
    return (
      <div className={`rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-4 py-3 ${className}`}>
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">AI call starting…</p>
        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Waiting for dial (may take a few seconds)</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`text-left ${className}`}>
        <p className="text-sm font-mono font-bold tabular-nums text-sky-800 dark:text-sky-200">{formatCountdownSeconds(remainSec)}</p>
        <p className="text-[10px] text-sky-600 dark:text-sky-400">{remainSec}s left</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/90 dark:bg-sky-900/25 px-4 py-3 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400 mb-1">Scheduled AI call</p>
      <p className="text-2xl font-mono font-bold tabular-nums text-sky-900 dark:text-sky-100">{formatCountdownSeconds(remainSec)}</p>
      <p className="text-xs text-sky-700 dark:text-sky-300 mt-1">
        <span className="font-semibold">{remainSec}</span> seconds remaining
      </p>
    </div>
  );
}

/** Isolated client timer — parent can re-render without resetting tick state unnecessarily. */
export const ScheduledCallCountdown = memo(ScheduledCallCountdownInner);
