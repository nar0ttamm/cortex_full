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
  whatsapp:
    'bg-green-50 text-green-800 border-green-200 dark:bg-green-900/25 dark:text-green-300 dark:border-green-800',
  email: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-900/25 dark:text-sky-300 dark:border-sky-800',
  call: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-900/25 dark:text-violet-300 dark:border-violet-800',
};

const DIR_LABEL: Record<string, string> = {
  to_lead: 'To lead',
  from_lead: 'From lead',
  to_admin: 'Admin alert',
};

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    void fetchData();
  }, []);

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

      result.sort(
        (a, b) =>
          new Date(b.entries[0]?.timestamp ?? 0).getTime() -
          new Date(a.entries[0]?.timestamp ?? 0).getTime()
      );

      setLeadComms(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = useMemo(() => {
    return leadComms
      .filter((lc) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          lc.name.toLowerCase().includes(q) ||
          lc.phone.includes(search) ||
          (lc.email || '').toLowerCase().includes(q)
        );
      })
      .map((lc) => ({
        ...lc,
        entries: lc.entries.filter((e) => {
          if (!showAdmin && e.direction === 'to_admin') return false;
          if (typeFilter !== 'all' && e.type !== typeFilter) return false;
          return true;
        }),
      }))
      .filter((lc) => lc.entries.length > 0);
  }, [leadComms, typeFilter, showAdmin, search]);

  useEffect(() => {
    if (filteredLeads.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredLeads.some((l) => l.id === selectedId)) {
      setSelectedId(filteredLeads[0].id);
    }
  }, [filteredLeads, selectedId]);

  const selected = filteredLeads.find((l) => l.id === selectedId) ?? null;

  const actions = (
    <button
      onClick={fetchData}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors"
    >
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto flex flex-col min-h-[calc(100vh-8rem)]">
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
          Tap a lead&apos;s name to open their full profile. Use <strong className="text-slate-700 dark:text-slate-300">Thread</strong> to preview only that person&apos;s timeline on this page — the right panel never mixes multiple leads.
        </p>

        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email…"
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'whatsapp', 'email', 'call'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  typeFilter === f
                    ? 'bg-teal-500 text-white border-teal-500'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-300'
                }`}
              >
                {f === 'all' ? 'All types' : f === 'whatsapp' ? 'WhatsApp' : f === 'email' ? 'Email' : 'Calls'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowAdmin((v) => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
              showAdmin
                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
            }`}
          >
            Admin alerts
          </button>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-12 text-center flex-1 flex items-center justify-center">
            <p className="text-slate-400 text-sm font-medium">No communications match your filters.</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0 lg:min-h-[560px]">
            {/* Lead list — desktop sidebar / mobile sheet */}
            <aside
              className={`lg:w-80 xl:w-96 shrink-0 flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm min-h-[280px] lg:min-h-0 flex-1 lg:flex-initial ${
                mobileShowDetail ? 'hidden lg:flex' : 'flex'
              }`}
            >
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Leads ({filteredLeads.length})
                </p>
              </div>
              <ul className="overflow-y-auto flex-1 p-2 space-y-1">
                {filteredLeads.map((lc) => {
                  const active = selectedId === lc.id;
                  const last = lc.entries[0]?.timestamp;
                  return (
                    <li key={lc.id}>
                      <div
                        className={`flex items-stretch rounded-xl border transition-all ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-900/25 border-teal-200 dark:border-teal-700 shadow-sm'
                            : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <Link
                          href={`/leads/${lc.id}`}
                          className="flex-1 flex items-start gap-3 px-3 py-3 min-w-0 text-left rounded-l-xl"
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                              active
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {lc.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{lc.name}</p>
                            <p className="text-[11px] text-slate-500 truncate">{lc.phone}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {lc.entries.length} item{lc.entries.length !== 1 ? 's' : ''}
                              {last ? ` · ${timeAgo(last)}` : ''}
                            </p>
                          </div>
                        </Link>
                        <button
                          type="button"
                          title="Preview this lead’s thread on this page"
                          onClick={() => {
                            setSelectedId(lc.id);
                            setMobileShowDetail(true);
                          }}
                          className={`shrink-0 px-2.5 py-3 rounded-r-xl border-l text-[11px] font-semibold transition-colors ${
                            active
                              ? 'border-teal-200 dark:border-teal-700 bg-teal-100/50 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
                              : 'border-slate-100 dark:border-slate-700 text-slate-500 hover:bg-white/80 dark:hover:bg-slate-600/50'
                          }`}
                        >
                          Thread
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Detail — single lead only */}
            <section
              className={`flex-1 flex flex-col min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm ${
                selected ? (mobileShowDetail ? 'flex' : 'hidden lg:flex') : 'hidden'
              }`}
            >
              {selected ? (
                <>
                  <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gradient-to-r from-slate-50 to-teal-50/40 dark:from-slate-900/50 dark:to-teal-950/20">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        className="lg:hidden text-sm font-semibold text-teal-600 dark:text-teal-400 shrink-0"
                        onClick={() => setMobileShowDetail(false)}
                      >
                        ← Back
                      </button>
                      <div>
                        <p className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                          Selected lead
                        </p>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{selected.name}</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {selected.phone}
                          {selected.email ? ` · ${selected.email}` : ''}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/leads/${selected.id}`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow-sm transition-colors shrink-0"
                    >
                      Open lead profile
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Timeline for <strong className="text-slate-700 dark:text-slate-200">{selected.name}</strong> only — newest first.
                    </p>
                    {selected.entries.map((entry, i) => (
                      <article
                        key={i}
                        className={`rounded-2xl border p-4 ${
                          entry.direction === 'from_lead'
                            ? 'border-teal-200 bg-teal-50/50 dark:border-teal-800 dark:bg-teal-950/20'
                            : entry.direction === 'to_admin'
                              ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20'
                              : 'border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide ${TYPE_COLORS[entry.type]}`}
                          >
                            {entry.type}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {DIR_LABEL[entry.direction] || entry.direction}
                          </span>
                          {entry.status && (
                            <span
                              className={`text-[11px] font-semibold ${
                                entry.status === 'fulfilled' ? 'text-emerald-600' : 'text-red-500'
                              }`}
                            >
                              {entry.status === 'fulfilled' ? 'Delivered' : 'Failed'}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {new Date(entry.timestamp).toLocaleString()} · {timeAgo(entry.timestamp)}
                          </span>
                        </div>
                        {entry.subject && (
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                            Subject: {entry.subject}
                          </p>
                        )}
                        {entry.message && (
                          <div className="rounded-xl border border-white/80 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5">
                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                              {entry.message}
                            </p>
                          </div>
                        )}
                        {entry.transcript && (
                          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/40 px-3 py-2.5 mt-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                              Call transcript
                            </p>
                            <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                              {entry.transcript}
                            </p>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-12 text-slate-400 text-sm">Select a lead</div>
              )}
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
