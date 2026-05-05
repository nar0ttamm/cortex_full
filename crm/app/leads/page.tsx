'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { Lead } from '@/types';
import { ScheduledCallCountdown } from '@/components/ScheduledCallCountdown';
import { getEffectiveScheduledCallAt } from '@/lib/scheduledCallDisplay';

type ViewMode = 'list' | 'kanban';

const KANBAN_COLUMNS = [
  { id: 'new',                   label: 'New',          color: 'text-blue-700 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800',   dot: 'bg-blue-500' },
  { id: 'interested',            label: 'Interested',   color: 'text-teal-700 dark:text-teal-400',    bg: 'bg-teal-50 dark:bg-teal-900/20',     border: 'border-teal-200 dark:border-teal-800',   dot: 'bg-teal-500' },
  { id: 'appointment_scheduled', label: 'Scheduled',    color: 'text-violet-700 dark:text-violet-400',bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800',dot: 'bg-violet-500' },
  { id: 'confirmed',             label: 'Confirmed',    color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',   border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  { id: 'not_interested',        label: 'Lost',         color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800',     dot: 'bg-red-500' },
];

function normalizeKanbanStatus(s: string) {
  const lower = (s || 'new').toLowerCase().replace(/ /g, '_');
  const found = KANBAN_COLUMNS.find(c => c.id === lower);
  return found ? found.id : 'new';
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const fetchLeads = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const response = await fetch('/api/crm-data?action=leads');
      if (response.status === 401) {
        setError('Please sign in to continue.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch leads' }));
        const errorMessage = errorData.error || 'Failed to fetch leads';

        if (errorMessage.includes('Authentication required') || errorMessage.includes('authentication')) {
          setError('Please sign in to continue.');
          setTimeout(() => {
            window.location.href = '/login';
          }, 1500);
          return;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      setLeads(data.leads || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leads');
      console.error('Leads error:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeads(false);
  }, [fetchLeads]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchLeads(true);
    }, 8000);
    return () => clearInterval(id);
  }, [fetchLeads]);

  useEffect(() => {
    filterLeads();
  }, [leads, searchTerm, statusFilter]);

  const filterLeads = () => {
    let filtered = [...leads];

    if (searchTerm) {
      filtered = filtered.filter(
        (lead) =>
          lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lead.phone?.includes(searchTerm) ||
          lead.inquiry?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    setFilteredLeads(filtered);
  };

  const moveCard = async (leadId: string, newStatus: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || normalizeKanbanStatus(lead.status) === newStatus) return;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    setUpdating(leadId);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? lead : l));
    } finally { setUpdating(null); }
  };

  const onDragStart = (e: React.DragEvent, id: string) => { dragRef.current = id; setDragLeadId(id); e.dataTransfer.effectAllowed = 'move'; };
  const onDragOver = (e: React.DragEvent, colId: string) => { e.preventDefault(); setDragOverCol(colId); };
  const onDrop = (e: React.DragEvent, colId: string) => { e.preventDefault(); const id = dragRef.current; if (id) moveCard(id, colId); setDragLeadId(null); setDragOverCol(null); dragRef.current = null; };
  const onDragEnd = () => { setDragLeadId(null); setDragOverCol(null); dragRef.current = null; };

  function timeAgo(iso?: string) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('new')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (statusLower.includes('interested')) return 'bg-teal-100 text-teal-800 border-teal-200';
    if (statusLower.includes('not interested')) return 'bg-red-100 text-red-800 border-red-200';
    if (statusLower.includes('appointment') || statusLower.includes('scheduled')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (statusLower.includes('closed')) return 'bg-slate-100 text-slate-800 border-slate-200';
    return 'bg-sky-100 text-sky-800 border-sky-200';
  };

  const getCallStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower.includes('completed')) return 'text-teal-600';
    if (statusLower.includes('pending')) return 'text-orange-600';
    if (statusLower.includes('in progress')) return 'text-blue-600';
    return 'text-slate-600';
  };

  const uniqueStatuses = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));

  // Don't show full-screen loading - keep header visible

  const actions = (
    <>
      {/* View toggle */}
      <div className="flex gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <button
          onClick={() => setViewMode('list')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          title="List view"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
          <span className="hidden sm:inline">List</span>
        </button>
        <button
          onClick={() => setViewMode('kanban')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'kanban' ? 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
          title="Kanban view"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="9" width="4" height="12" rx="1"/></svg>
          <span className="hidden sm:inline">Kanban</span>
        </button>
      </div>
      <button
        onClick={() => void fetchLeads(false)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      >
        <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Loading...' : 'Refresh'}
      </button>
      <Link
        href="/data"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Lead
      </Link>
    </>
  );

  // Kanban view
  if (viewMode === 'kanban') {
    const grouped = KANBAN_COLUMNS.reduce((acc, col) => {
      acc[col.id] = filteredLeads.filter(l => normalizeKanbanStatus(l.status) === col.id);
      return acc;
    }, {} as Record<string, Lead[]>);

    return (
      <AppShell title="Leads" actions={actions}>
        <div className="p-4 sm:p-5 h-[calc(100vh-57px)] flex flex-col">
          {/* Quick filter bar */}
          <div className="flex gap-2 mb-3 shrink-0">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search leads…"
              className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 text-sm text-slate-700 dark:text-slate-200 dark:bg-slate-800 placeholder-slate-400 outline-none"
            />
            <p className="text-xs text-slate-400 flex items-center">{filteredLeads.length} leads</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
            {KANBAN_COLUMNS.map(col => {
              const cards = grouped[col.id] || [];
              const isOver = dragOverCol === col.id;
              return (
                <div
                  key={col.id}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDrop={e => onDrop(e, col.id)}
                  onDragLeave={() => setDragOverCol(null)}
                  className={`flex flex-col w-full sm:shrink-0 sm:w-[240px] rounded-2xl border transition-all ${isOver ? `${col.border} ${col.bg} shadow-lg` : 'border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'}`}
                >
                  <div className={`px-3 py-2.5 rounded-t-2xl border-b ${col.border} ${col.bg} shrink-0 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${col.bg} ${col.color} border ${col.border}`}>{cards.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {cards.length === 0 && (
                      <div className={`border-2 border-dashed rounded-xl p-5 flex items-center justify-center ${isOver ? `${col.border} ${col.bg}` : 'border-slate-200 dark:border-slate-700'}`}>
                        <p className="text-xs text-slate-400">Drop here</p>
                      </div>
                    )}
                    {cards.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={e => onDragStart(e, lead.id ?? '')}
                        onDragEnd={onDragEnd}
                        className={`bg-white dark:bg-slate-800 border rounded-xl p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all group ${
                          updating === lead.id ? 'opacity-50 pointer-events-none' : ''
                        } ${dragLeadId === lead.id ? 'opacity-40 scale-95' : 'border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${col.bg} ${col.color}`}>
                              {lead.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <Link href={`/leads/${lead.id}`} onClick={e => e.stopPropagation()} className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate block hover:text-teal-600 transition-colors">
                                {lead.name}
                              </Link>
                              <p className="text-[10px] text-slate-400">{lead.phone}</p>
                            </div>
                          </div>
                        </div>
                        {lead.inquiry && <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mt-1.5">{lead.inquiry}</p>}
                        <div className="flex items-center justify-between mt-1.5">
                          {lead.source && <span className="text-[9px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full uppercase">{lead.source}</span>}
                          <span className="text-[9px] text-slate-400 ml-auto">{timeAgo(lead.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Leads" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-4 sm:p-5 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, phone..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all text-sm text-slate-700 placeholder-slate-400 outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all text-sm text-slate-700 outline-none bg-white"
            >
              <option value="all">All Statuses</option>
              {uniqueStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Showing <span className="font-semibold text-teal-600">{filteredLeads.length}</span> of <span className="font-semibold text-slate-700">{leads.length}</span> leads
          </p>
        </div>

        {/* List */}
        {error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
            <p className="text-red-700 dark:text-red-400 text-sm font-medium">{error}</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 p-14 text-center">
            <p className="text-slate-400 text-sm font-medium">No leads found</p>
            {(searchTerm || statusFilter !== 'all') && (
              <p className="text-slate-400 text-xs mt-1">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className={`md:hidden space-y-2 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {filteredLeads.map((lead, index) => (
                <Link key={lead.id || index} href={`/leads/${lead.id}`}
                  className="block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-4 hover:border-teal-300 dark:hover:border-teal-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${getStatusColor(lead.status || '')}`}>
                        {lead.name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{lead.name || 'N/A'}</p>
                        <p className="text-xs text-slate-400">{lead.phone || 'N/A'}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide ${getStatusColor(lead.status || '')}`}>
                      {lead.status || 'N/A'}
                    </span>
                  </div>
                  {lead.inquiry && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 pl-12">{lead.inquiry}</p>
                  )}
                  {(getEffectiveScheduledCallAt(lead) && !lead.call_initiated) || lead.active_call?.label ? (
                    <div className="mt-2 pl-12 flex flex-wrap items-center gap-2">
                      {lead.active_call?.label && (
                        <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">{lead.active_call.label}</span>
                      )}
                      {getEffectiveScheduledCallAt(lead) && !lead.call_initiated && (
                        <ScheduledCallCountdown
                          compact
                          scheduledAtIso={getEffectiveScheduledCallAt(lead)!}
                          callInitiated={!!lead.call_initiated}
                        />
                      )}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>

            {/* Desktop: table */}
            <div className={`hidden md:block bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-700">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-700/50">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Inquiry</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden xl:table-cell">AI call</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden xl:table-cell">Appt</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {filteredLeads.map((lead, index) => (
                      <tr key={lead.id || index} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link href={`/leads/${lead.id}`} className="group block">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                              {lead.name || 'N/A'}
                            </p>
                            {lead.source && <p className="text-xs text-slate-400 mt-0.5">{lead.source}</p>}
                          </Link>
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-sm text-slate-700 dark:text-slate-200">{lead.phone || 'N/A'}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">{lead.email || '—'}</p>
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">{lead.inquiry || '—'}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusColor(lead.status || '')}`}>
                            {lead.status || 'N/A'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden xl:table-cell">
                          {lead.active_call?.label ? (
                            <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">{lead.active_call.label}</span>
                          ) : getEffectiveScheduledCallAt(lead) && !lead.call_initiated ? (
                            <ScheduledCallCountdown
                              compact
                              scheduledAtIso={getEffectiveScheduledCallAt(lead)!}
                              callInitiated={!!lead.call_initiated}
                            />
                          ) : (
                            <span className={`text-xs font-medium ${getCallStatusColor(lead.ai_call_status || '')}`}>
                              {lead.ai_call_status || 'Pending'}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 hidden xl:table-cell">
                          <span className="text-xs text-slate-500">
                            {lead.appointment_status === 'Scheduled' && lead.appointment_date
                              ? new Date(lead.appointment_date).toLocaleDateString()
                              : '—'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/leads/${lead.id}`} className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors">
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
