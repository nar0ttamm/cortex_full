'use client';

import { useState, useEffect } from 'react';

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
      done ? 'bg-teal-500 text-white' : active ? 'border-2 border-teal-500 text-teal-400' : 'border border-slate-700 text-slate-500'
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
        .then(d => {
          if (d?.tenantId) {
            return fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/teams?tenantId=${d.tenantId}`);
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
        headers: { 'Content-Type': 'application/json' },
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
      <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">New Project</h2>
            <p className="text-xs text-slate-400 mt-0.5">Set up a new sales project</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3 shrink-0">
          {[1, 2, 3, 4].map((n, i) => (
            <div key={n} className="flex items-center gap-3">
              <StepDot n={n} current={step} />
              {i < 3 && <div className={`w-8 h-px ${n < step ? 'bg-teal-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-slate-400">
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
              <h3 className="text-sm font-semibold text-slate-300 mb-4">Project Details</h3>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Project Name <span className="text-teal-400">*</span>
                </label>
                <input
                  value={data.name}
                  onChange={e => setField('name', e.target.value)}
                  placeholder="e.g. Prestige Heights Q2 Campaign"
                  className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Description
                </label>
                <textarea
                  value={data.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="What is this project about? What are the goals?"
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Lead Source */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">How will leads come in?</h3>
              <p className="text-xs text-slate-400 mb-4">Select the primary lead source for this project. You can change this later.</p>
              <div className="grid grid-cols-2 gap-2">
                {LEAD_SOURCES.map(src => (
                  <label
                    key={src.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      data.leadSource === src.id
                        ? 'border-teal-500/60 bg-teal-500/10 text-white'
                        : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <input type="radio" name="leadSource" value={src.id} checked={data.leadSource === src.id} onChange={() => setField('leadSource', src.id)} className="sr-only" />
                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      data.leadSource === src.id ? 'border-teal-400 bg-teal-400' : 'border-slate-600'
                    }`}>
                      {data.leadSource === src.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-medium">{src.label}</span>
                  </label>
                ))}
              </div>
              {data.leadSource === 'csv' && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Upload CSV / Excel</label>
                  <div className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center hover:border-teal-500/40 transition-colors">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={e => setField('csvFile', e.target.files?.[0] || null)}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer">
                      <svg className="w-8 h-8 text-slate-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-sm text-slate-400">{data.csvFile ? data.csvFile.name : 'Click to upload or drag & drop'}</p>
                      <p className="text-xs text-slate-500 mt-1">CSV, XLSX up to 10MB</p>
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
                  <h3 className="text-sm font-semibold text-slate-300">Products / Properties</h3>
                  <p className="text-xs text-slate-400 mt-0.5">The AI agent will use these to pitch to leads</p>
                </div>
                <button onClick={addProduct} className="flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Product
                </button>
              </div>

              {data.products.map((product, idx) => (
                <div key={product.id} className="border border-slate-700 rounded-xl p-4 space-y-3 bg-slate-800/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Product {idx + 1}</span>
                    {data.products.length > 1 && (
                      <button onClick={() => removeProduct(product.id)} className="text-slate-500 hover:text-red-400 transition">
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
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
                        <input
                          value={product[field]}
                          onChange={e => updateProduct(product.id, field, e.target.value)}
                          placeholder={placeholder}
                          className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Amenities</label>
                      <textarea
                        value={product.amenities}
                        onChange={e => updateProduct(product.id, 'amenities', e.target.value)}
                        placeholder="Gym, Pool, Parking, Clubhouse, 24/7 Security…"
                        rows={2}
                        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500/50 transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={addProduct} className="w-full border-2 border-dashed border-slate-700 rounded-xl p-3 text-sm text-slate-400 hover:border-teal-500/40 hover:text-teal-400 transition-all flex items-center justify-center gap-2">
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
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Assign a Team</h3>
              <p className="text-xs text-slate-400 mb-4">Choose an existing team or create a new one for this project.</p>

              {teams.length > 0 && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Existing Teams</label>
                    <div className="space-y-2">
                      {teams.map(team => (
                        <label key={team.id} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          data.teamId === team.id ? 'border-teal-500/60 bg-teal-500/10 text-white' : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                        }`}>
                          <input type="radio" name="team" value={team.id} checked={data.teamId === team.id} onChange={() => setData(d => ({ ...d, teamId: team.id, newTeamName: '' }))} className="sr-only" />
                          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${data.teamId === team.id ? 'border-teal-400 bg-teal-400' : 'border-slate-600'}`}>
                            {data.teamId === team.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <span className="text-sm font-medium">{team.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-slate-700 pt-4">
                    <p className="text-xs text-slate-400 mb-3">Or create a new team:</p>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">New Team Name</label>
                <input
                  value={data.newTeamName}
                  onChange={e => setData(d => ({ ...d, newTeamName: e.target.value, teamId: '' }))}
                  placeholder="e.g. Mumbai Sales Team"
                  className="w-full px-4 py-3 bg-slate-800/70 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500/50 transition-all"
                />
              </div>

              <div className="mt-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <p className="text-xs text-slate-400">
                  <span className="text-teal-400 font-semibold">Tip:</span> You can skip team assignment and add it later from the Team page. Projects without a team are visible to all admins.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 shrink-0 flex gap-3">
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 border border-slate-700 text-slate-400 rounded-xl text-sm hover:border-slate-600 hover:text-slate-300 transition">
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
              className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-400 hover:to-cyan-500 transition-all"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex-[2] py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-400 hover:to-cyan-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
