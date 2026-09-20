'use client';

import { useEffect, useState } from 'react';
import type { Lead } from '@/types';
import { getBackendAuthHeaders } from '@/lib/backendAuth';
import { useTenantId } from '@/app/hooks/useTenantId';

const API = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const NEXT_LABEL: Record<string, string> = {
  assign_project: 'Assign a project',
  call_now: 'Call now',
  callback: 'Callback scheduled',
  appointment: 'Appointment scheduled',
  human_followup: 'Human follow-up required',
  send_whatsapp: 'Send WhatsApp',
  waiting: 'Waiting for customer',
  nurture: 'Nurture',
  closed: 'Closed / not interested',
};

function tempStyle(temp?: string | null) {
  const t = (temp || '').toLowerCase();
  if (t === 'hot') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
  if (t === 'qualified') return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800';
  if (t === 'warm') return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  if (t === 'cold') return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
  return 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
}

function formatWhen(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function shown(value?: string | null) {
  if (!value || value === 'unknown' || value === 'not mentioned') return 'Not mentioned';
  return value;
}

export function LeadConversionPanel({
  lead,
  onUpdated,
  onCallNow,
  calling,
}: {
  lead: Lead;
  onUpdated: () => Promise<void> | void;
  onCallNow: () => void;
  calling?: boolean;
}) {
  const { tenantId } = useTenantId();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [people, setPeople] = useState<{ id: string; full_name?: string; email?: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!API || !tenantId) return;
    void (async () => {
      try {
        const headers = await getBackendAuthHeaders();
        const [pRes, uRes] = await Promise.all([
          fetch(`${API}/v1/projects?tenantId=${encodeURIComponent(tenantId)}`, { headers }),
          fetch(`${API}/v1/users?tenantId=${encodeURIComponent(tenantId)}`, { headers }),
        ]);
        if (pRes.ok) {
          const d = await pRes.json();
          setProjects(d.projects || d || []);
        }
        if (uRes.ok) {
          const d = await uRes.json();
          setPeople(d.users || d || []);
        }
      } catch {
        /* optional extras */
      }
    })();
  }, [tenantId]);

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', leadId: lead.id, lead: body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const score = lead.score;
  const temp = lead.temperature;
  const showHandoff = Boolean(lead.human_handoff) || String(temp || '').toLowerCase() === 'hot' || (score != null && score >= 81);
  const nextKey = lead.next_action || (lead.needs_project_assignment ? 'assign_project' : null);
  const nextLabel = nextKey ? NEXT_LABEL[nextKey] || nextKey : 'No next action scheduled';
  const nextWhen = formatWhen(lead.next_action_at || lead.callback_time || lead.appointment_date || lead.scheduled_call_at);
  const callbackUnspecified = Boolean(lead.metadata?.callback_requested) && !nextWhen && nextKey === 'callback';
  const signals = Array.isArray(lead.score_signals)
    ? lead.score_signals
    : typeof lead.score_signals === 'string'
      ? [lead.score_signals]
      : [];
  const explanation = signals.length ? signals.slice(0, 4).join(' + ') : null;

  return (
    <div className="space-y-4">
      {lead.needs_project_assignment && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Project required before AI call</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-1">
            {lead.project_assignment_reason || 'Assign a project so the AI uses the right knowledge.'}
          </p>
        </div>
      )}

      {showHandoff && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-red-800 dark:text-red-200">Human follow-up recommended</p>
          <p className="text-xs text-red-700/80 dark:text-red-300/70 mt-1">
            {explanation || 'This lead looks qualified. Assign a salesperson or call now.'}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {showHandoff ? 'Hot lead' : 'Sales brief'}
            </p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-1">
              {score == null ? 'Not available' : `${score} / 100`}
            </p>
            {explanation && score != null && (
              <p className="text-xs text-slate-500 mt-1 max-w-md">{explanation}</p>
            )}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wide ${tempStyle(temp)}`}>
            {temp ? temp : 'Not scored'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Project</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{lead.project_name || 'Not assigned'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Requirement</p>
            <p className="text-sm font-medium">{shown(lead.property_type)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Budget</p>
            <p className="text-sm font-medium">{shown(lead.budget)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Timeline</p>
            <p className="text-sm font-medium">{shown(lead.timeline)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Intent</p>
            <p className="text-sm font-medium">{shown(lead.interest_level)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Main objection</p>
            <p className="text-sm font-medium">{shown(Array.isArray(lead.objections) ? lead.objections[0] : lead.objections)}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">AI summary</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
            {lead.last_summary || 'Not available — appears after a completed AI conversation.'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Next action</p>
        <p className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-1">{nextLabel}</p>
        {nextWhen && <p className="text-sm text-slate-500 mt-0.5">{nextWhen}</p>}
        {callbackUnspecified && (
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">Time not specified — schedule before calling.</p>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={onCallNow}
            disabled={calling || lead.needs_project_assignment}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white disabled:opacity-40"
          >
            {calling ? 'Connecting…' : 'Call now'}
          </button>
          <a href="/communications" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200">
            WhatsApp / Email
          </a>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Qualification</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Intent</p>
            <p className="text-sm font-medium">{shown(lead.interest_level)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Timeline</p>
            <p className="text-sm font-medium">{shown(lead.timeline)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Budget</p>
            <p className="text-sm font-medium">{shown(lead.budget)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Requirement</p>
            <p className="text-sm font-medium">{shown(lead.property_type)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Location</p>
            <p className="text-sm font-medium">{shown(lead.preferred_location)}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase">Objection</p>
            <p className="text-sm font-medium">{shown(Array.isArray((lead as any).objections) ? (lead as any).objections[0] : (lead as any).objections)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5 space-y-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Assign</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            Project
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              value={lead.project_id || ''}
              disabled={saving}
              onChange={(e) => void patch({ project_id: e.target.value || null })}
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Salesperson
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm"
              value={lead.assigned_to || ''}
              disabled={saving}
              onChange={(e) => void patch({ assigned_to: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
