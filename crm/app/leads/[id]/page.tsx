'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Lead } from '@/types';
import { AppShell } from '../../components/AppShell';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Note {
  id: string;
  text: string;
  author: string;
  timestamp: string;
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

export default function LeadDetailPage() {
  const params = useParams();
  const leadId = params.id as string;
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { fetchLead(); }, [leadId]);

  const fetchLead = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/sheets?action=lead&id=${leadId}`);
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok) throw new Error('Failed to fetch lead');
      const data = await response.json();
      if (!data.lead) throw new Error('Lead not found');
      setLead(data.lead);
      setNotes(data.lead.metadata?.notes || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load lead');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`${API_URL}/v1/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to save note');
      const data = await res.json();
      setNotes(prev => [...prev, data.note]);
      setNoteText('');
    } catch (e: any) {
      console.error(e.message);
    } finally {
      setAddingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await fetch(`${API_URL}/v1/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {}
  };

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('new')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
    if (s.includes('not_interested') || s.includes('not interested')) return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    if (s.includes('interested')) return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800';
    if (s.includes('scheduled') || s.includes('appointment')) return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800';
    if (s.includes('closed')) return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600';
    return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800';
  };

  const backAction = (
    <Link href="/leads" className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </Link>
  );

  const SectionTitle = ({ label }: { label: string }) => (
    <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
      <span className="w-1 h-4 bg-teal-500 rounded-full" />
      {label}
    </h2>
  );

  const Field = ({ label, value }: { label: string; value?: string | null }) => (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-100 font-medium">{value || '—'}</p>
    </div>
  );

  const card = 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5 sm:p-6';

  if (loading) {
    return (
      <AppShell title="Lead Detail" actions={backAction}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (error || !lead) {
    return (
      <AppShell title="Lead Detail" actions={backAction}>
        <div className="p-6 text-center">
          <p className="text-slate-500 text-sm">{error || 'Lead not found'}</p>
          <Link href="/leads" className="text-teal-600 text-sm underline mt-2 inline-block">Back to Leads</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={lead.name || 'Lead Detail'} actions={backAction}>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Basic info */}
            <div className={card}>
              <SectionTitle label="Basic Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Full Name" value={lead.name} />
                <Field label="Phone" value={lead.phone} />
                <Field label="Email" value={lead.email} />
                <Field label="Source" value={lead.source} />
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Inquiry</p>
                  <div className="bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-100 dark:border-slate-600 px-4 py-3">
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{lead.inquiry || '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className={card}>
              <SectionTitle label="Status" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Lead Status</p>
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(lead.status || '')}`}>
                    {lead.status || 'N/A'}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">AI Call</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                    {lead.ai_call_status || 'Pending'}
                    {(lead as any).metadata?.calling_mode === 'simulated' && (
                      <span className="ml-2 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">Sim</span>
                    )}
                  </p>
                </div>
                <Field label="Appointment Status" value={lead.appointment_status || 'Not Scheduled'} />
                {lead.appointment_date && (
                  <Field label="Appointment Date" value={new Date(lead.appointment_date).toLocaleString()} />
                )}
              </div>
            </div>

            {/* Call Transcript */}
            {lead.call_transcript && (
              <div className={card}>
                <SectionTitle label="Call Transcript" />
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-100 dark:border-slate-600 px-4 py-4">
                  <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">{lead.call_transcript}</p>
                </div>
                {lead.call_result && (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Call Result</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{lead.call_result}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className={card}>
              <SectionTitle label={`Notes (${notes.length})`} />

              {/* Add note */}
              <div className="mb-4">
                <textarea
                  ref={noteRef}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }}
                  placeholder="Add a note... (Ctrl+Enter to save)"
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 resize-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || addingNote}
                    className="px-4 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    {addingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No notes yet</p>
              ) : (
                <div className="space-y-2">
                  {[...notes].reverse().map(note => (
                    <div key={note.id} className="bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-900/30 rounded-xl px-4 py-3 group relative">
                      <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px] text-slate-400">{note.author} · {timeAgo(note.timestamp)}</p>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Timeline */}
            <div className={card.replace('sm:p-6', '')}>
              <SectionTitle label="Timeline" />
              <ol className="space-y-4">
                {lead.timestamp && (
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 mt-1 shrink-0 shadow-sm shadow-sky-200" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Lead Created</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(lead.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                )}
                {lead.ai_call_status && lead.ai_call_status !== 'Pending' && (
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 mt-1 shrink-0 shadow-sm shadow-teal-200" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">AI Call {lead.ai_call_status}</p>
                    </div>
                  </li>
                )}
                {lead.appointment_status === 'Scheduled' && (
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500 mt-1 shrink-0 shadow-sm shadow-violet-200" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Appointment Scheduled</p>
                      <p className="text-xs text-slate-400 mt-0.5">{lead.appointment_date ? new Date(lead.appointment_date).toLocaleString() : ''}</p>
                    </div>
                  </li>
                )}
                {lead.last_update && (
                  <li className="flex items-start gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Last Updated</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(lead.last_update).toLocaleString()}</p>
                    </div>
                  </li>
                )}
              </ol>
            </div>

            {/* Actions */}
            <div className={card.replace('sm:p-6', '')}>
              <SectionTitle label="Actions" />
              <div className="space-y-2">
                <Link
                  href="/communications"
                  className="flex items-center justify-between px-4 py-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl text-sm font-semibold text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors group"
                >
                  Communications
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Notes count summary */}
            {notes.length > 0 && (
              <div className={`${card.replace('sm:p-6', '')} bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20`}>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                  <span>📝</span>
                  {notes.length} note{notes.length > 1 ? 's' : ''}
                </p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-500/60 mt-1">Last: {timeAgo(notes[notes.length-1]?.timestamp)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
