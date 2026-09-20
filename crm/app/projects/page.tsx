'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';
import { getBackendAuthHeaders } from '@/lib/backendAuth';

type Project = {
  id: string;
  name: string;
  description?: string;
  status: string;
  lead_source?: string;
  team_name?: string;
  lead_count?: number;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  csv: 'CSV / Excel',
  manual: 'Manual',
  meta: 'Meta',
  google: 'Google',
  indiaMart: 'IndiaMART',
  justdial: 'Justdial',
  zapier: 'Webhook',
  other: 'Other',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) return;
      const me = await meRes.json();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/projects?tenantId=${me.tenantId}`, {
        headers: await getBackendAuthHeaders(),
      });
      if (!res.ok) throw new Error('Could not load projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onCreated = () => load();
    window.addEventListener('cortex:project-created', onCreated);
    return () => window.removeEventListener('cortex:project-created', onCreated);
  }, [load]);

  const actions = (
    <button
      onClick={() => (document.querySelector('[data-action="new-project"]') as HTMLButtonElement)?.click()}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent-soft)] text-[var(--accent)] rounded-lg text-xs font-semibold border border-[var(--accent)]/20 hover:bg-[var(--accent)] hover:text-white transition-colors"
    >
      New project
    </button>
  );

  return (
    <AppShell title="Projects" actions={actions}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        <div className="cf-card p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--fg-muted)]">Campaigns</p>
          <h2 className="mt-1 font-serif text-xl text-[var(--fg)]">Projects the AI can sell</h2>
          <p className="mt-2 text-sm text-[var(--fg-muted)] leading-relaxed">
            A project is a listing, batch, or campaign. Assign a team so the right people own it. Leads imported later can be tagged to a project so the caller uses the right knowledge base.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="cf-card px-6 py-14 text-center">
            <p className="font-serif text-2xl text-[var(--fg)]">No projects yet</p>
            <p className="mt-2 text-sm text-[var(--fg-muted)] max-w-md mx-auto">
              Create a project after you have a team. You can still skip team assignment if you are the only operator.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <Link href="/team" className="cf-btn-secondary">Set up a team</Link>
              <button
                onClick={() => (document.querySelector('[data-action="new-project"]') as HTMLButtonElement)?.click()}
                className="cf-btn-primary"
              >
                New project
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="cf-card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--fg)]">{p.name}</p>
                  {p.description && <p className="mt-0.5 text-xs text-[var(--fg-muted)] line-clamp-2">{p.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] rounded-lg border border-[var(--border)] px-2 py-0.5 text-[var(--fg-muted)]">
                      {p.team_name || 'Unassigned'}
                    </span>
                    {p.lead_source && (
                      <span className="text-[11px] rounded-lg border border-[var(--border)] px-2 py-0.5 text-[var(--fg-muted)]">
                        {SOURCE_LABELS[p.lead_source] || p.lead_source}
                      </span>
                    )}
                    <span className="text-[11px] rounded-lg border border-[var(--border)] px-2 py-0.5 capitalize text-[var(--fg-muted)]">
                      {p.status}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl font-bold text-[var(--accent)]">{Number(p.lead_count || 0)}</p>
                  <p className="text-[10px] text-[var(--fg-muted)]">leads</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
