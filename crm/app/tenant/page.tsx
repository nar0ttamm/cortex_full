'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { DEFAULT_TENANT_ID } from '@/lib/tenantConfig';

const TENANT_ID = DEFAULT_TENANT_ID;
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface TenantProfile {
  name: string;
  // settings fields
  owner_name: string;
  contact_email: string;
  whatsapp_number: string;
  phone_number: string;
  business_type: string;
  website: string;
  timezone: string;
  call_delay_seconds: string;
}

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
  'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles',
  'Australia/Sydney', 'UTC',
];

const BUSINESS_TYPES = [
  'Real Estate', 'Insurance', 'Education', 'Healthcare', 'Finance',
  'E-commerce', 'Consulting', 'Hospitality', 'Automotive', 'Technology', 'Other',
];

const FIELDS: { key: keyof TenantProfile; label: string; type?: string; placeholder?: string; hint?: string; options?: string[] }[] = [
  { key: 'name',              label: 'Business Name',         placeholder: 'e.g. Acme Real Estate',           hint: 'Your company or brand name' },
  { key: 'owner_name',        label: 'Owner / Admin Name',    placeholder: 'e.g. Narottam Sharma',            hint: 'Primary contact person' },
  { key: 'contact_email',     label: 'Lead Notification Email', placeholder: 'e.g. admin@yourbusiness.com',  hint: 'Receive new lead alerts on this email' },
  { key: 'whatsapp_number',   label: 'WhatsApp Number',       placeholder: '+91 XXXXX XXXXX',                 hint: 'Receive WhatsApp lead alerts (E.164 format)', type: 'tel' },
  { key: 'phone_number',      label: 'Phone Number',          placeholder: '+91 XXXXX XXXXX',                 hint: 'Business contact number', type: 'tel' },
  { key: 'website',           label: 'Website',               placeholder: 'https://yourbusiness.com',        hint: 'Your website URL (optional)', type: 'url' },
  { key: 'business_type',     label: 'Industry / Business Type', placeholder: 'Select industry',             hint: 'Helps personalize AI responses', options: BUSINESS_TYPES },
  { key: 'timezone',          label: 'Timezone',              placeholder: 'Select timezone',                 hint: 'Used for scheduling calls and reminders', options: TIMEZONES },
  { key: 'call_delay_seconds', label: 'Call Delay (seconds)', placeholder: '120',                            hint: 'Delay before AI calls a new lead (min 60)', type: 'number' },
];

export default function TenantPage() {
  const [form, setForm] = useState<TenantProfile>({
    name: '', owner_name: '', contact_email: '', whatsapp_number: '',
    phone_number: '', business_type: '', website: '', timezone: 'Asia/Kolkata',
    call_delay_seconds: '120',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchTenant(); }, []);

  const fetchTenant = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/v1/tenant/${TENANT_ID}`);
      if (!res.ok) throw new Error('Failed to fetch tenant');
      const data = await res.json();
      const t = data.tenant;
      const s = t.settings || {};
      setForm({
        name:                t.name || '',
        owner_name:          s.owner_name || '',
        contact_email:       s.contact_email || '',
        whatsapp_number:     s.whatsapp_number || '',
        phone_number:        s.phone_number || '',
        business_type:       s.business_type || '',
        website:             s.website || '',
        timezone:            s.timezone || 'Asia/Kolkata',
        call_delay_seconds:  String(s.call_delay_seconds ?? 120),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { name, ...rest } = form;
      const res = await fetch(`${API_URL}/v1/tenant/${TENANT_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          settings: {
            ...rest,
            call_delay_seconds: parseInt(rest.call_delay_seconds) || 120,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const initials = form.name
    ? form.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : 'T';

  const inputCls = (disabled: boolean) =>
    `w-full px-4 py-2.5 border rounded-xl text-sm transition-all outline-none ${
      disabled
        ? 'bg-slate-50 border-slate-100 text-slate-500 cursor-default'
        : 'bg-white border-slate-200 text-slate-800 focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400'
    }`;

  const actions = (
    <div className="flex items-center gap-2">
      {saved && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-teal-600">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </span>
      )}
      {editing ? (
        <>
          <button
            onClick={() => { setEditing(false); fetchTenant(); }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <AppShell title="Tenant Settings" actions={actions}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Tenant Settings" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8">

        {/* Profile header card */}
        <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg p-6 sm:p-8 mb-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl shrink-0 border border-white/30">
              <span className="text-white font-bold text-3xl">{initials}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{form.name || 'My Business'}</h2>
              <p className="text-teal-100 text-sm mt-1">{form.business_type || 'Business'} · {form.timezone}</p>
              <p className="text-teal-200/70 text-xs mt-1 font-mono">{TENANT_ID}</p>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="shrink-0 px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-colors border border-white/30 backdrop-blur-sm"
              >
                Edit Profile
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form sections */}
        <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <span className="w-1 h-4 bg-teal-500 rounded-full" />
              Business Profile
            </h3>
            {!editing && (
              <p className="text-xs text-slate-400 mt-0.5">Click Edit to modify your tenant settings</p>
            )}
          </div>

          <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FIELDS.map(f => (
              <div key={f.key} className={f.key === 'name' || f.key === 'website' ? 'sm:col-span-2 lg:col-span-3' : ''}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  {f.label}
                </label>
                {f.options ? (
                  <select
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    disabled={!editing}
                    className={inputCls(!editing)}
                  >
                    <option value="">{f.placeholder}</option>
                    {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type || 'text'}
                    value={form[f.key]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    disabled={!editing}
                    placeholder={f.placeholder}
                    className={inputCls(!editing)}
                    min={f.type === 'number' ? 60 : undefined}
                  />
                )}
                {f.hint && (
                  <p className="text-[10px] text-slate-400 mt-1 leading-snug">{f.hint}</p>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => { setEditing(false); fetchTenant(); }}
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
          {[
            { icon: '👤', label: 'Owner', value: form.owner_name || 'Not set', color: 'bg-amber-50 border-amber-100' },
            { icon: '📧', label: 'Lead Emails To', value: form.contact_email || 'Not set', color: 'bg-sky-50 border-sky-100' },
            { icon: '💬', label: 'WhatsApp Alerts', value: form.whatsapp_number || 'Not set', color: 'bg-green-50 border-green-100' },
            { icon: '⏱️', label: 'Call Delay', value: `${form.call_delay_seconds}s after lead entry`, color: 'bg-violet-50 border-violet-100' },
          ].map(item => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.color}`}>
              <p className="text-lg mb-1">{item.icon}</p>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{item.label}</p>
              <p className="text-xs font-semibold text-slate-700 mt-1 break-all">{item.value}</p>
            </div>
          ))}
        </div>

      </div>
    </AppShell>
  );
}
