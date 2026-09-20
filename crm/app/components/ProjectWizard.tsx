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
  csvFile: File | null;
  products: Product[];
  teamId: string;
  newTeamName: string;
  assignToMyTeam: boolean;
};

const LEAD_SOURCES = [
  { id: 'meta', label: 'Meta Lead Ads' },
  { id: 'google', label: 'Google Lead Forms' },
  { id: 'indiaMart', label: 'IndiaMART' },
  { id: 'justdial', label: 'Justdial' },
  { id: 'zapier', label: 'Zapier / Webhook' },
  { id: 'csv', label: 'CSV / Excel Import' },
  { id: 'manual', label: 'Manual Entry' },
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

function StepDot({ n, current }: { n: number; current: number }) {
  const done = n < current;
  const active = n === current;
  return (
    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
      done ? 'bg-[var(--accent)] text-white' : active ? 'border-2 border-[var(--accent)] text-[var(--accent)]' : 'border border-[var(--border)] text-[var(--fg-muted)]'
    }`}>
      {done ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ) : n}
    </div>
  );
}

export function ProjectWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({
    name: '', description: '', leadSource: '', csvFile: null,
    products: [emptyProduct()], teamId: '', newTeamName: '', assignToMyTeam: false,
  });
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStep(1);
      setData({ name: '', description: '', leadSource: '', csvFile: null, products: [emptyProduct()], teamId: '', newTeamName: '', assignToMyTeam: false });
      setError('');
      // Fetch teams
      fetch('/api/me')
        .then(r => r.ok ? r.json() : null)
        .then(async (d) => {
          if (d?.tenantId) {
            return fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/teams?tenantId=${d.tenantId}`, {
              headers: await getBackendAuthHeaders(),
            });
          }
        })
        .then(r => r?.ok ? r.json() : null)
        .then(d => { if (d?.teams) setTeams(d.teams); })
        .catch(() => {});
    }
  }, [open]);

  function setField<K extends keyof WizardData>(k: K, v: WizardData[K]) {
    setData(d => ({ ...d, [k]: v }));
  }

  function updateProduct(id: string, field: keyof Product, value: string) {
    setData(d => ({
      ...d,
      products: d.products.map(p => p.id === id ? { ...p, [field]: value } : p),
    }));
  }

  function addProduct() {
    setData(d => ({ ...d, products: [...d.products, emptyProduct()] }));
  }

  function removeProduct(id: string) {
    setData(d => ({ ...d, products: d.products.filter(p => p.id !== id) }));
  }

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/me');
      const me = await meRes.json();
      const tenantId = me?.tenantId;
      if (!tenantId) throw new Error('Not authenticated');

      const payload = {
        tenantId,
        name: data.name,
        description: data.description,
        leadSource: data.leadSource,
        products: data.products.filter(p => p.name.trim()),
        teamId: data.teamId || null,
        newTeamName: data.newTeamName || null,
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/projects`, {
        method: 'POST',
        headers: await getBackendAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to create project');

      onCreated?.(resData.project.id);
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
      {/* Backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="font-serif text-2xl text-[var(--fg)]">New project</h2>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">Set up a new sales project</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-[var(--fg-muted)] transition hover:bg-[var(--bg-warm)] hover:text-[var(--fg)]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-4">
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="flex items-center gap-3">
              <StepDot n={n} current={step} />
              {i < 3 && <div className={`h-px w-8 ${n < step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-[var(--fg-muted)]">
            {step === 1 && 'Basic info'}
            {step === 2 && 'Lead source'}
            {step === 3 && 'Knowledge base'}
            {step === 4 && 'Team'}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="mb-4 text-sm font-semibold text-[var(--fg)]">Project Details</h3>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  Project Name <span className="text-[var(--accent)]">*</span>
                </label>
                <input
                  value={data.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Prestige Heights Q2 Campaign"
                  className="cf-input"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                  Description
                </label>
                <textarea
                  value={data.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="What is this project about? What are the goals?"
                  rows={4}
                  className="cf-input resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Lead Source */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--fg)]">How will leads come in?</h3>
              <p className="mb-4 text-xs text-[var(--fg-muted)]">Select the primary lead source for this project. You can change this later.</p>
              <div className="grid grid-cols-2 gap-2">
                {LEAD_SOURCES.map(src => (
                  <label
                    key={src.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      data.leadSource === src.id
                        ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--fg)]'
                        : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] hover:border-[var(--accent)]/30'
                    }`}
                  >
                    <input type="radio" name="leadSource" value={src.id} checked={data.leadSource === src.id} onChange={() => setField('leadSource', src.id)} className="sr-only" />
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      data.leadSource === src.id ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'
                    }`}>
                      {data.leadSource === src.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-medium">{src.label}</span>
                  </label>
                ))}
              </div>
              {data.leadSource === 'csv' && (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Upload CSV / Excel</label>
                  <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-6 text-center transition-colors hover:border-[var(--accent)]/40">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={e => setField('csvFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                      <svg className="mx-auto mb-2 h-8 w-8 text-[var(--fg-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-[var(--fg-muted)]">{data.csvFile ? data.csvFile.name : 'Click to upload or drag & drop'}</p>
                      <p className="mt-1 text-xs text-[var(--fg-muted)]">CSV, XLSX up to 10MB</p>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Knowledge Base / Products */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--fg)]">Products / Properties</h3>
                  <p className="mt-0.5 text-xs text-[var(--fg-muted)]">The AI agent will use these to pitch to leads</p>
                </div>
                <button onClick={addProduct} className="flex items-center gap-1.5 text-xs text-[var(--accent)] transition hover:text-[var(--accent-hover)]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Product
                </button>
              </div>

              {data.products.map((product, idx) => (
                <div key={product.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Product {idx + 1}</span>
                    {data.products.length > 1 && (
                      <button onClick={() => removeProduct(product.id)} className="text-[var(--fg-muted)] transition hover:text-red-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { field: 'name' as const, label: 'Product / Property Name', placeholder: 'Prestige Heights 3BHK', full: true },
                      { field: 'property_type' as const, label: 'Property Type', placeholder: 'Apartment, Villa, Plot…' },
                      { field: 'location' as const, label: 'Location', placeholder: 'Andheri East, Mumbai' },
                      { field: 'price_range' as const, label: 'Price Range', placeholder: '₹85L – ₹1.2Cr' },
                      { field: 'size' as const, label: 'Size / Area', placeholder: '1200 sqft' },
                      { field: 'possession_status' as const, label: 'Possession Status', placeholder: 'Ready to Move / Q3 2026' },
                    ].map(({ field, label, placeholder, full }) => (
                      <div key={field} className={full ? 'col-span-2' : ''}>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">{label}</label>
                        <input
                          value={product[field]}
                          onChange={e => updateProduct(product.id, field, e.target.value)}
                          placeholder={placeholder}
                          className="cf-input !rounded-lg !px-3 !py-2.5 !text-xs"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Amenities</label>
                      <textarea
                        value={product.amenities}
                        onChange={e => updateProduct(product.id, 'amenities', e.target.value)}
                        placeholder="Gym, Pool, Parking, Clubhouse, 24/7 Security…"
                        rows={2}
                        className="cf-input resize-none !rounded-lg !px-3 !py-2.5 !text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addProduct} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] p-3 text-sm text-[var(--fg-muted)] transition-all hover:border-[var(--accent)]/40 hover:text-[var(--accent)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add another product
              </button>
            </div>
          )}

          {/* Step 4: Team */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="mb-2 text-sm font-semibold text-[var(--fg)]">Assign a Team</h3>
              <p className="mb-4 text-xs text-[var(--fg-muted)]">Choose an existing team or create a new one for this project.</p>

              {teams.length > 0 && (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Existing Teams</label>
                    <div className="space-y-2">
                      {teams.map(team => (
                        <label key={team.id} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          data.teamId === team.id ? 'border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--fg)]' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] hover:border-[var(--accent)]/30'
                        }`}>
                          <input type="radio" name="team" value={team.id} checked={data.teamId === team.id} onChange={() => setData(d => ({ ...d, teamId: team.id, newTeamName: '' }))} className="sr-only" />
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${data.teamId === team.id ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}>
                            {data.teamId === team.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm font-medium">{team.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-[var(--border)] pt-4">
                    <p className="mb-3 text-xs text-[var(--fg-muted)]">Or create a new team:</p>
                  </div>
                </>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">New Team Name</label>
                <input
                  value={data.newTeamName}
                  onChange={e => setData(d => ({ ...d, newTeamName: e.target.value, teamId: '' }))}
                  placeholder="e.g. Mumbai Sales Team"
                  className="cf-input"
                />
              </div>

              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <p className="text-xs text-[var(--fg-muted)]">
                  <span className="font-semibold text-[var(--accent)]">Tip:</span> You can skip team assignment and add it later from the Team page. Projects without a team are visible to all admins.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-3 border-t border-[var(--border)] px-6 py-4">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="cf-btn-secondary flex-1">
              ← Back
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => {
                if (step === 1 && !data.name.trim()) { setError('Project name is required'); return; }
                setError('');
                setStep(s => s + 1);
              }}
              className="cf-btn-primary flex-[2]"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="cf-btn-primary flex-[2]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating project…
                </span>
              ) : 'Create Project ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
