'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  source?: string;
  created_at?: string;
  timestamp?: string;
  inquiry?: string;
  metadata?: any;
}

const COLUMNS: { id: string; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { id: 'new',                   label: 'New',          color: 'text-blue-700 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800',   dot: 'bg-blue-500' },
  { id: 'interested',            label: 'Interested',   color: 'text-teal-700 dark:text-teal-400',    bg: 'bg-teal-50 dark:bg-teal-900/20',     border: 'border-teal-200 dark:border-teal-800',   dot: 'bg-teal-500' },
  { id: 'appointment_scheduled', label: 'Scheduled',    color: 'text-violet-700 dark:text-violet-400',bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800',dot: 'bg-violet-500' },
  { id: 'confirmed',             label: 'Confirmed',    color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20',   border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  { id: 'not_interested',        label: 'Lost',         color: 'text-red-700 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800',     dot: 'bg-red-500' },
];

function normalizeStatus(s: string) {
  const lower = (s || 'new').toLowerCase().replace(/ /g, '_');
  const found = COLUMNS.find(c => c.id === lower);
  return found ? found.id : 'new';
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  useEffect(() => { fetchLeads(); }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/crm-data?action=leads');
      if (!res.ok) return;
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  const moveCard = async (leadId: string, newStatus: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || normalizeStatus(lead.status) === newStatus) return;

    // Optimistic update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    setUpdating(leadId);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Rollback
        setLeads(prev => prev.map(l => l.id === leadId ? lead : l));
      }
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? lead : l));
    } finally {
      setUpdating(null);
    }
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent, id: string) => {
    dragRef.current = id;
    setDragLeadId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colId);
  };

  const onDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    const id = dragRef.current;
    if (id) moveCard(id, colId);
    setDragLeadId(null);
    setDragOverCol(null);
    dragRef.current = null;
  };

  const onDragEnd = () => {
    setDragLeadId(null);
    setDragOverCol(null);
    dragRef.current = null;
  };

  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.id] = leads.filter(l => normalizeStatus(l.status) === col.id);
    return acc;
  }, {} as Record<string, Lead[]>);

  function timeAgo(iso?: string) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  const actions = (
    <button onClick={fetchLeads} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  );

  if (loading) {
    return (
      <AppShell title="Pipeline" actions={actions}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Pipeline" actions={actions}>
      <div className="p-4 sm:p-5 sm:h-[calc(100vh-57px)] flex flex-col">
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 shrink-0">
          {leads.length} leads · Drag cards to change status
        </p>

        {/* Board — horizontal scroll on desktop, vertical stack on mobile */}
        <div className="flex flex-col sm:flex-row gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
          {COLUMNS.map(col => {
            const cards = grouped[col.id] || [];
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDrop={e => onDrop(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
                className={`flex flex-col w-full sm:shrink-0 sm:w-[260px] rounded-2xl border transition-all ${
                  isOver
                    ? `${col.border} ${col.bg} shadow-lg scale-[1.01]`
                    : 'border-slate-200/70 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50'
                }`}
              >
                {/* Column header */}
                <div className={`px-4 py-3 rounded-t-2xl border-b ${col.border} ${col.bg} shrink-0`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.bg} ${col.color} border ${col.border}`}>
                      {cards.length}
                    </span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {cards.length === 0 && (
                    <div className={`border-2 border-dashed rounded-xl p-6 flex items-center justify-center transition-all ${isOver ? `${col.border} ${col.bg}` : 'border-slate-200 dark:border-slate-700'}`}>
                      <p className="text-xs text-slate-400">Drop here</p>
                    </div>
                  )}
                  {cards.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => onDragStart(e, lead.id)}
                      onDragEnd={onDragEnd}
                      className={`bg-white dark:bg-slate-800 border rounded-xl p-3.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-all group ${
                        updating === lead.id ? 'opacity-50 pointer-events-none' : ''
                      } ${
                        dragLeadId === lead.id ? 'opacity-40 scale-95' : 'border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${col.bg} ${col.color}`}>
                            {lead.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{lead.name}</p>
                            <p className="text-[10px] text-slate-400">{lead.phone}</p>
                          </div>
                        </div>
                        <Link
                          href={`/leads/${lead.id}`}
                          onClick={e => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 shrink-0 text-slate-400 hover:text-teal-600 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </Link>
                      </div>

                      {lead.inquiry && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2 mb-2">{lead.inquiry}</p>
                      )}

                      <div className="flex items-center justify-between mt-1">
                        {lead.source && (
                          <span className="text-[9px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            {lead.source}
                          </span>
                        )}
                        <span className="text-[9px] text-slate-400 ml-auto">{timeAgo(lead.created_at || lead.timestamp)}</span>
                      </div>

                      {updating === lead.id && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <div className="w-3 h-3 border border-teal-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-[9px] text-teal-600">Updating...</span>
                        </div>
                      )}
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
