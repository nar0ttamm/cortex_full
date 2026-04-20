'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { fetchCallsForTenant, type CallRow } from '@/lib/callsApi';
import { useTenantId } from '@/app/hooks/useTenantId';
import { isCallStatusLive, labelForCallDbStatus } from '@/lib/callStatusUi';

function fmtDuration(sec?: number | null) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function formatOutcome(outcome: string | null | undefined): string {
  if (!outcome) return '—';
  const map: Record<string, string> = {
    appointment_booked: 'Appointment Booked',
    interested: 'Interested',
    not_interested: 'Not Interested',
    callback: 'Callback Requested',
    unknown: '—',
    dial_failed: 'Call Failed',
    completed: 'Completed',
  };
  return map[outcome.toLowerCase()] || outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'failed')
    return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800';
  if (s === 'ringing' || s === 'active' || s === 'answered')
    return 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  if (s === 'completed' || s === 'ended')
    return 'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  if (s === 'initiating' || s === 'dialing')
    return 'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-28" /></td>
      <td className="px-4 py-3"><div className="h-5 bg-slate-200 dark:bg-slate-700 rounded-lg w-20" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-24" /></td>
      <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-28" /></td>
      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-12" /></td>
      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-32" /></td>
      <td className="px-4 py-3"><div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full w-40" /></td>
    </tr>
  );
}

export default function CallsPage() {
  const { tenantId, ready, authError } = useTenantId();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const callsRef = useRef<CallRow[]>([]);
  callsRef.current = calls;

  const load = useCallback(async (silent = false) => {
    if (!tenantId) return;
    try {
      if (!silent) { setLoading(true); setError(null); }
      const data = await fetchCallsForTenant(tenantId, {
        limit: 150,
        status: statusFilter || undefined,
      });
      setCalls(data.calls || []);
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load calls');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenantId, statusFilter]);

  useEffect(() => {
    if (!ready || !tenantId) return;
    void load();
  }, [load, ready, tenantId]);

  // Background poll — only while a call is live, no loading flash
  useEffect(() => {
    if (!tenantId) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (callsRef.current.some((c) => isCallStatusLive(c.status))) void load(true);
    }, 4000);
    return () => clearInterval(t);
  }, [tenantId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((c) => {
      const phone = (c.phone || c.lead_phone || '').toLowerCase();
      const name = (c.lead_name || '').toLowerCase();
      return phone.includes(q) || name.includes(q);
    });
  }, [calls, query]);

  const liveCount = useMemo(() => calls.filter((c) => isCallStatusLive(c.status)).length, [calls]);

  return (
    <AppShell title="AI Calls" actions={null}>
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-950">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Call History</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                All outbound AI calls made from this workspace.
                {liveCount > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">{liveCount} call{liveCount > 1 ? 's' : ''} in progress.</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-sm">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{calls.length}</span>
              </div>
              {liveCount > 0 && (
                <div className="flex gap-2 rounded-xl bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-800 px-3 py-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse self-center" />
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wide">Live</span>
                  <span className="text-sm font-bold text-violet-900 dark:text-violet-200">{liveCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone number…"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-sm rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-slate-900 dark:text-slate-100 shadow-sm min-w-[160px]"
              >
                <option value="">All statuses</option>
                <option value="initiating">Connecting</option>
                <option value="ringing">Ringing</option>
                <option value="active">In Progress</option>
                <option value="answered">Answered</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="ended">Ended</option>
              </select>
              <button
                type="button"
                onClick={() => load()}
                className="text-xs font-semibold px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {authError ? (
            <p className="text-center text-sm text-slate-600 dark:text-slate-400 py-16">
              Please{' '}
              <Link href="/login" className="text-teal-600 font-semibold underline">sign in</Link>{' '}
              to view calls.
            </p>
          ) : !ready || !tenantId ? (
            <div className="flex justify-center py-24">
              <div className="w-9 h-9 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              {error}
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
                      {['When', 'Status', 'Lead', 'Phone', 'Duration', 'Outcome', 'Summary'].map(h => (
                        <th key={h} className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
                  </tbody>
                </table>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 py-16 text-center">
              <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">
                {calls.length === 0 ? 'No calls yet for this workspace.' : 'No results match your search.'}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700">
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">When</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Status</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Lead</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hidden md:table-cell">Phone</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hidden lg:table-cell">Duration</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 hidden lg:table-cell">Outcome</th>
                      <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Summary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap text-xs">
                          {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusBadge(c.status)}`}>
                            {isCallStatusLive(c.status) && (
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            )}
                            {labelForCallDbStatus(c.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {c.lead_id ? (
                            <Link
                              href={`/leads/${c.lead_id}`}
                              className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                            >
                              {c.lead_name || 'Unknown'}
                            </Link>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200 text-xs hidden md:table-cell">
                          {c.phone || c.lead_phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs hidden lg:table-cell tabular-nums">
                          {fmtDuration(c.duration_seconds)}
                        </td>
                        <td className="px-4 py-3 text-xs hidden lg:table-cell">
                          {c.outcome && c.outcome !== 'unknown' ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                              c.outcome === 'appointment_booked' ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300' :
                              c.outcome === 'interested' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300' :
                              c.outcome === 'not_interested' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' :
                              'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                              {formatOutcome(c.outcome)}
                            </span>
                          ) : '—'}
                        </td>
                        <td
                          className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-[200px] sm:max-w-xs truncate"
                          title={c.summary || c.error_message || ''}
                        >
                          {c.summary || (c.error_message ? <span className="text-red-500">{c.error_message}</span> : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
