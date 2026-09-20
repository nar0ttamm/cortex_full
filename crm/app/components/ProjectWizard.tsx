'use client';

import { useState, useEffect } from 'react';
import { getBackendAuthHeaders } from '@/lib/backendAuth';

type Product = {
  id: string;
  name: string;
  property_type: string;
  location: string;
  price_range: string;
  size: string;
  possession_status: string;
  amenities: string;
};

type WizardData = {
  name: string;
  description: string;
  leadSource: string;
  products: Product[];
  teamId: string;
  newTeamName: string;
};

const LEAD_SOURCES = [
  { id: 'csv', label: 'CSV / Excel' },
  { id: 'manual', label: 'Manual entry' },
  { id: 'meta', label: 'Meta Lead Ads' },
  { id: 'google', label: 'Google Lead Forms' },
  { id: 'indiaMart', label: 'IndiaMART' },
  { id: 'justdial', label: 'Justdial' },
  { id: 'zapier', label: 'Webhook / Zapier' },
  { id: 'other', label: 'Other' },
];

function emptyProduct(): Product {
  return {
    id: Math.random().toString(36).slice(2),
    name: '',
    property_type: '',
    location: '',
    price_range: '',
    size: '',
    possession_status: '',
    amenities: '',
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (projectId: string) => void;
};

export function ProjectWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: '', description: '', leadSource: 'csv',
    products: [emptyProduct()], teamId: '', newTeamName: '',
  });
  const [teams, setTeams] = useState<{ id: string; name: string; member_count?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showProduct, setShowProduct] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setData({
      name: '', description: '', leadSource: 'csv',
      products: [emptyProduct()], teamId: '', newTeamName: '',
    });
    setError('');
    setShowProduct(false);
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (!d?.tenantId) return null;
        return fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/teams?tenantId=${d.tenantId}`, {
          headers: await getBackendAuthHeaders(),
        });
      })
      .then((r) => (r?.ok ? r.json() : null))
      .then((d) => {
        if (d?.teams) {
          setTeams(d.teams);
          if (d.teams.length === 1) {
            setData((prev) => ({ ...prev, teamId: d.teams[0].id }));
          }
        }
      })
      .catch(() => {});
  }, [open]);

  function setField<K extends keyof WizardData>(k: K, v: WizardData[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function updateProduct(id: string, field: keyof Product, value: string) {
    setData((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }));
  }

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/me');
      const me = await meRes.json();
      const tenantId = me?.tenantId;
      if (!tenantId) throw new Error('Not authenticated');

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/projects`, {
        method: 'POST',
        headers: await getBackendAuthHeaders(),
        body: JSON.stringify({
          tenantId,
          name: data.name,
          description: data.description,
          leadSource: data.leadSource,
          products: showProduct ? data.products.filter((p) => p.name.trim()) : [],
          teamId: data.teamId || null,
          newTeamName: data.teamId ? null : data.newTeamName || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create project');

      const projectId = resData.project.id;
      window.dispatchEvent(new CustomEvent('cortex:project-created', { detail: { projectId } }));
      onCreated?.(projectId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[998] flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="font-serif text-2xl text-[var(--fg)]">New project</h2>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
              A project is a campaign or listing the AI will sell.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--fg-muted)] transition hover:bg-[var(--bg-warm)] hover:text-[var(--fg)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-3">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${step === 1 ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--fg-muted)]'}`}>
            1 · Details
          </span>
          <span className="h-px w-6 bg-[var(--border)]" />
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${step === 2 ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--fg-muted)]'}`}>
            2 · Team
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  Project name <span className="text-[var(--accent)]">*</span>
                </label>
                <input
                  value={data.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="e.g. Prestige Heights Q2"
                  className="cf-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  What is this for?
                </label>
                <textarea
                  value={data.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Optional — site visits for a new tower, admissions for the spring batch…"
                  rows={3}
                  className="cf-input resize-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  How will leads arrive?
                </label>
                <select
                  value={data.leadSource}
                  onChange={(e) => setField('leadSource', e.target.value)}
                  className="cf-input"
                >
                  {LEAD_SOURCES.map((src) => (
                    <option key={src.id} value={src.id}>{src.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">
                  Import or connect leads after this project exists — from Data or Integrations.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--fg)]">Who owns this project?</h3>
                <p className="mt-1 text-xs text-[var(--fg-muted)]">
                  Assign a sales team so executives see the right campaigns. You can skip this.
                </p>
              </div>

              {teams.length > 0 ? (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <label
                      key={team.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all ${
                        data.teamId === team.id
                          ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--fg)]'
                          : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] hover:border-[var(--accent)]/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="team"
                        checked={data.teamId === team.id}
                        onChange={() => setData((d) => ({ ...d, teamId: team.id, newTeamName: '' }))}
                        className="sr-only"
                      />
                      <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${data.teamId === team.id ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}>
                        {data.teamId === team.id && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="flex-1 text-sm font-medium">{team.name}</span>
                      {team.member_count != null && (
                        <span className="text-[11px] text-[var(--fg-muted)]">{team.member_count} people</span>
                      )}
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setData((d) => ({ ...d, teamId: '', newTeamName: d.newTeamName }))}
                    className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  >
                    Don’t assign a team yet
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <p className="text-sm text-[var(--fg)]">No teams yet</p>
                  <p className="mt-1 text-xs text-[var(--fg-muted)]">
                    Name one here, or create it later from Team. Projects without a team stay visible to admins.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  {teams.length > 0 ? 'Or create a new team' : 'New team name'}
                </label>
                <input
                  value={data.newTeamName}
                  onChange={(e) => setData((d) => ({ ...d, newTeamName: e.target.value, teamId: '' }))}
                  placeholder="e.g. Mumbai sales"
                  className="cf-input"
                />
              </div>

              <div className="border-t border-[var(--border)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowProduct((v) => !v)}
                  className="flex w-full items-center justify-between text-left text-sm font-semibold text-[var(--fg)]"
                >
                  What should the AI pitch? (optional)
                  <span className="text-xs font-normal text-[var(--accent)]">{showProduct ? 'Hide' : 'Add'}</span>
                </button>
                {showProduct && (
                  <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <input
                      value={data.products[0]?.name || ''}
                      onChange={(e) => updateProduct(data.products[0].id, 'name', e.target.value)}
                      placeholder="Product or property name"
                      className="cf-input !py-2.5 !text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={data.products[0]?.location || ''}
                        onChange={(e) => updateProduct(data.products[0].id, 'location', e.target.value)}
                        placeholder="Location"
                        className="cf-input !py-2.5 !text-sm"
                      />
                      <input
                        value={data.products[0]?.price_range || ''}
                        onChange={(e) => updateProduct(data.products[0].id, 'price_range', e.target.value)}
                        placeholder="Price range"
                        className="cf-input !py-2.5 !text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-[var(--border)] px-6 py-4">
          {step > 1 && (
            <button onClick={() => setStep((s) => s - 1)} className="cf-btn-secondary flex-1">
              Back
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => {
                if (!data.name.trim()) {
                  setError('Give the project a name');
                  return;
                }
                setError('');
                setStep(2);
              }}
              className="cf-btn-primary flex-[2]"
            >
              Continue
            </button>
          ) : (
            <button onClick={handleCreate} disabled={loading} className="cf-btn-primary flex-[2]">
              {loading ? 'Creating…' : 'Create project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
