'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { fetchCallsForTenant, type CallRow } from '@/lib/callsApi';
import { useTenantId } from '@/app/hooks/useTenantId';
import { isCallStatusLive, labelForCallDbStatus } from '@/lib/callStatusUi';

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'failed') return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/30';
  if (s === 'ringing' || s === 'active' || s === 'answered')
    return 'bg-amber-500/10 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-500/30';
  if (s === 'completed' || s === 'ended')
    return 'bg-teal-500/10 text-teal-800 dark:text-teal-400 border-teal-200 dark:border-teal-500/30';
  if (s === 'initiating' || s === 'dialing')
    return 'bg-sky-500/10 text-sky-800 dark:text-sky-400 border-sky-200 dark:border-sky-500/30';
  return 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/30';
}

export default function CallsPage() {
  const { tenantId, ready, authError } = useTenantId();
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const callsRef = useRef<CallRow[]>([]);
  callsRef.current = calls;

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCallsForTenant(tenantId, {
        limit: 100,
        status: statusFilter || undefined,
      });
      setCalls(data.calls || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load calls');
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, statusFilter]);

  useEffect(() => {
    if (!ready || !tenantId) return;
    void load();
  }, [load, ready, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (callsRef.current.some((c) => isCallStatusLive(c.status))) {
        void load();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [tenantId, load]);

  return (
    <AppShell title="AI calls" actions={null}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Outbound calls — status from the{' '}
            <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700">
              calls
            </code>{' '}
            table (updates faster while a call is live).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 shadow-sm"
            >
              <option value="">All</option>
              <option value="initiating">initiating</option>
              <option value="ringing">ringing</option>
              <option value="active">active</option>
              <option value="answered">answered</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="ended">ended</option>
            </select>
            <button
              type="button"
              onClick={() => load()}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {authError ? (
          <p className="text-center text-sm text-slate-600 dark:text-slate-400 py-16">
            Please <Link href="/login" className="text-teal-600 font-semibold underline">sign in</Link> to view calls.
          </p>
        ) : !ready || !tenantId ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-300">
            {error}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calls.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-16 text-sm">No calls yet for this workspace.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/40 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-500">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Call ID</th>
                  <th className="px-4 py-3 font-semibold">Error / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border transition-all duration-300 ${statusBadge(c.status)}`}
                      >
                        {labelForCallDbStatus(c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.lead_id ? (
                        <Link
                          href={`/leads/${c.lead_id}`}
                          className="text-teal-600 dark:text-teal-400 hover:underline font-medium"
                        >
                          {c.lead_name || c.lead_id.slice(0, 8) + '…'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-300 font-mono text-xs">
                      {c.phone || c.lead_phone || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={c.id}>
                      {c.id}
                    </td>
                    <td
                      className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate"
                      title={c.error_message || c.summary || ''}
                    >
                      {c.error_message || c.summary || c.outcome || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
