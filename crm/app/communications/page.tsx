'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';

interface CommEntry {
  type: 'whatsapp' | 'email' | 'call';
  direction: 'to_lead' | 'from_lead' | 'to_admin';
  message?: string;
  subject?: string;
  transcript?: string;
  timestamp: string;
  status?: string;
}

interface LeadComms {
  id: string;
  name: string;
  phone: string;
  email?: string;
  entries: CommEntry[];
}

const TYPE_COLORS: Record<string, string> = {
  whatsapp: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800',
  email:    'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800',
  call:     'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800',
};

const DIR_LABEL: Record<string, string> = {
  to_lead:   '→ To Lead',
  from_lead: '← From Lead',
  to_admin:  '⚙ Admin Alert',
};

/** Drop near-duplicate rows (e.g. transcript + comm_log call with same body). */
function dedupeCommEntries(entries: CommEntry[]): CommEntry[] {
  const seen = new Set<string>();
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const out: CommEntry[] = [];
  for (const e of sorted) {
    const body = (e.message || e.transcript || e.subject || '').trim().slice(0, 160);
    const bucket = Math.floor(new Date(e.timestamp).getTime() / 120000);
    const key = `${e.type}|${e.direction}|${bucket}|${body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CommunicationsPage() {
  const [leadComms, setLeadComms] = useState<LeadComms[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'whatsapp' | 'email' | 'call'>('all');
  const [showAdmin, setShowAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/crm-data?action=leads');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const all: any[] = data.leads || [];

      const result: LeadComms[] = [];
      all.forEach((lead: any) => {
        const meta = lead.metadata || {};
        const entries: CommEntry[] = [];

        // Communications log (WhatsApp + Email)
        const log: any[] = meta.communications_log ?? [];
        log.forEach((e: any) => {
          entries.push({
            type: e.type,
            direction: e.direction,
            message: e.message,
            subject: e.subject,
            timestamp: e.timestamp ?? lead.updated_at ?? new Date().toISOString(),
            status: e.status,
          });
        });

        // Call transcript as a synthetic call entry
        const transcript = meta.call_transcript ?? lead.call_transcript;
        if (transcript) {
          entries.push({
            type: 'call',
            direction: 'to_lead',
            transcript,
            timestamp: meta.last_call_at ?? lead.updated_at ?? new Date().toISOString(),
          });
        }

        const merged = dedupeCommEntries(entries);

        if (merged.length > 0) {
          result.push({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            entries: merged,
          });
        }
      });

      // Sort leads by their most recent entry
      result.sort((a, b) =>
        new Date(b.entries[0]?.timestamp ?? 0).getTime() - new Date(a.entries[0]?.timestamp ?? 0).getTime()
      );

      setLeadComms(result);
      if (result.length > 0) setExpandedLead(result[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return leadComms
      .filter(lc => {
        if (!search) return true;
        return lc.name.toLowerCase().includes(search.toLowerCase()) ||
          lc.phone.includes(search) || (lc.email || '').toLowerCase().includes(search.toLowerCase());
      })
      .map(lc => ({
        ...lc,
        entries: lc.entries.filter(e => {
          if (!showAdmin && e.direction === 'to_admin') return false;
          if (typeFilter !== 'all' && e.type !== typeFilter) return false;
          return true;
        }),
      }))
      .filter(lc => lc.entries.length > 0);
  }, [leadComms, typeFilter, showAdmin, search]);

  const totalEntries = filtered.reduce((s, lc) => s + lc.entries.length, 0);

  const actions = (
    <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  );

  if (loading) {
    return (
      <AppShell title="Communications" actions={actions}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Communications" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>

          {/* Type filters */}
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'whatsapp', 'email', 'call'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  typeFilter === f
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-300 hover:text-teal-600'
                }`}
              >
                {f === 'all' ? 'All' : f === 'whatsapp' ? '💬 WA' : f === 'email' ? '📧 Email' : '📞 Calls'}
              </button>
            ))}
          </div>

          {/* Admin toggle */}
          <button
            onClick={() => setShowAdmin(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              showAdmin
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
            }`}
          >
            ⚙ Admin alerts
          </button>
        </div>

        {/* Summary */}
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} across {filtered.length}{' '}
          {filtered.length === 1 ? 'lead' : 'leads'} · duplicates from transcript + call log merged
        </p>

        {/* Per-lead groups */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 p-12 text-center">
            <p className="text-slate-400 text-sm font-medium">No communications found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(lc => {
              const isOpen = expandedLead === lc.id;
              return (
                <div key={lc.id} className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all ${isOpen ? 'border-teal-300 dark:border-teal-700 shadow-teal-100 dark:shadow-none' : 'border-slate-200/70 dark:border-slate-700'}`}>
                  {/* Lead header */}
                  <button
                    onClick={() => setExpandedLead(isOpen ? null : lc.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${isOpen ? 'bg-teal-500 text-white' : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'}`}>
                        {lc.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{lc.name}</p>
                        <p className="text-xs text-slate-400">{lc.phone}{lc.email ? ` · ${lc.email}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex gap-1">
                        {['whatsapp','email','call'].map(t => {
                          const count = lc.entries.filter(e => e.type === t).length;
                          if (!count) return null;
                          return (
                            <span key={t} className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${TYPE_COLORS[t]}`}>
                              {t === 'whatsapp' ? '💬' : t === 'email' ? '📧' : '📞'} {count}
                            </span>
                          );
                        })}
                      </div>
                      <Link
                        href={`/leads/${lc.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-teal-600 hover:text-teal-700 font-semibold"
                      >
                        View Lead
                      </Link>
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Entries */}
                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-700 divide-y divide-slate-50 dark:divide-slate-700/50">
                      {lc.entries.map((entry, i) => (
                        <div key={i} className={`px-5 py-3.5 ${entry.direction === 'from_lead' ? 'bg-teal-50/40 dark:bg-teal-900/10' : entry.direction === 'to_admin' ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}>
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide ${TYPE_COLORS[entry.type]}`}>
                                {entry.type}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {DIR_LABEL[entry.direction] || entry.direction}
                              </span>
                              {entry.status && (
                                <span className={`text-[10px] font-semibold ${entry.status === 'fulfilled' ? 'text-green-600' : 'text-red-500'}`}>
                                  {entry.status === 'fulfilled' ? '✓ Sent' : '✗ Failed'}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(entry.timestamp)}</span>
                          </div>

                          {entry.subject && (
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Subject: {entry.subject}</p>
                          )}
                          {entry.message && (
                            <div className="bg-white dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 px-3 py-2 mt-1">
                              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{entry.message}</p>
                            </div>
                          )}
                          {entry.transcript && (
                            <div className="bg-white dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 px-3 py-2 mt-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Call Transcript</p>
                              <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">{entry.transcript}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
