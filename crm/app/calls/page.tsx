'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { fetchCallsForTenant, type CallRow } from '@/lib/callsApi';
import { DEFAULT_TENANT_ID } from '@/lib/tenantConfig';

const TENANT_ID = DEFAULT_TENANT_ID;

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'failed') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (s === 'ringing' || s === 'active') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  if (s === 'completed') return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
  if (s === 'initiating') return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
  return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
}

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCallsForTenant(TENANT_ID, {
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
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="AI calls" actions={null}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Outbound calls via cortex_voice (status from <code className="text-xs bg-slate-800 px-1 rounded">calls</code> table).
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 uppercase tracking-wide">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
            >
              <option value="">All</option>
              <option value="initiating">initiating</option>
              <option value="ringing">ringing</option>
              <option value="active">active</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="ended">ended</option>
            </select>
            <button
              type="button"
              onClick={() => load()}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : calls.length === 0 ? (
          <p className="text-center text-slate-500 py-16 text-sm">No calls yet for this tenant.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Call ID</th>
                  <th className="px-4 py-3 font-semibold">Error / note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${statusBadge(c.status)}`}>
                        {c.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.lead_id ? (
                        <Link href={`/leads/${c.lead_id}`} className="text-teal-400 hover:underline font-medium">
                          {c.lead_name || c.lead_id.slice(0, 8) + '…'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{c.phone || c.lead_phone || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={c.id}>
                      {c.id}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate" title={c.error_message || c.summary || ''}>
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
