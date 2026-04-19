'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';

import { useTenantId } from '@/app/hooks/useTenantId';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Integration {
  id: string;
  integration_key: string;
  integration_type: string;
  label: string;
  status: string;
  webhook_url: string;
  created_at: string;
}

interface SupportedIntegration {
  key: string;
  label: string;
  type: string;
  icon: string;
}

interface IntegrationLog {
  id: string;
  integration_key: string;
  status: string;
  lead_id: string | null;
  error_message: string | null;
  created_at: string;
}

const PLATFORM_META: Record<string, { emoji: string; color: string; bg: string }> = {
  meta:      { emoji: '📘', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-100' },
  google:    { emoji: '🔴', color: 'text-red-600',    bg: 'bg-red-50 border-red-100' },
  indiamart: { emoji: '🟠', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
  justdial:  { emoji: '🟡', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-100' },
  zapier:    { emoji: '⚡', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  typeform:  { emoji: '🟣', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-100' },
  tally:     { emoji: '⬜', color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200' },
  webhook:   { emoji: '🔗', color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-100' },
};

function getPlatformMeta(key: string) {
  const prefix = key.split('_')[0];
  return PLATFORM_META[prefix] || PLATFORM_META['webhook'];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
    >
      {copied ? (
        <>
          <svg className="w-3 h-3 text-teal-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function SecretReveal({ callbackFn }: { callbackFn: () => Promise<string> }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reveal = async () => {
    if (
      !confirm(
        'Regenerating invalidates the previous webhook secret. Update any external systems that use it. Continue?'
      )
    ) {
      return;
    }
    setLoading(true);
    const s = await callbackFn();
    setSecret(s);
    setLoading(false);
  };

  if (!secret) {
    return (
      <button
        onClick={reveal}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Generating...' : 'Regenerate & reveal secret'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      <code className="text-xs font-mono bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded-lg text-teal-700 dark:text-teal-300 break-all">
        {secret}
      </code>
      <CopyButton text={secret} />
    </div>
  );
}

export default function IntegrationsPage() {
  const { tenantId } = useTenantId();
  const [supported, setSupported] = useState<SupportedIntegration[]>([]);
  const [connected, setConnected] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [activeTab, setActiveTab] = useState<'connected' | 'add' | 'logs'>('connected');

  const fetchData = async () => {
    if (!tenantId || !API_URL) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [sRes, cRes, lRes] = await Promise.all([
        fetch(`${API_URL}/v1/integrations/supported`),
        fetch(`${API_URL}/v1/integrations/${tenantId}`),
        fetch(`${API_URL}/v1/integrations/${tenantId}/logs?limit=30`),
      ]);
      if (sRes.ok) setSupported((await sRes.json()).integrations || []);
      if (cRes.ok) setConnected((await cRes.json()).integrations || []);
      if (lRes.ok) setLogs((await lRes.json()).logs || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    void fetchData();
  }, [tenantId]);

  const connect = async (key: string, label: string) => {
    if (!tenantId) return;
    setConnecting(key);
    try {
      const res = await fetch(`${API_URL}/v1/integrations/${tenantId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_key: key, label }),
      });
      if (res.ok) { await fetchData(); setActiveTab('connected'); }
    } catch (_) {}
    setConnecting(null);
  };

  const disconnect = async (key: string, label: string) => {
    if (!tenantId) return;
    if (!confirm(`Disconnect "${label}"? Leads from this source will stop being received.`)) return;
    await fetch(`${API_URL}/v1/integrations/${tenantId}/${key}`, { method: 'DELETE' });
    await fetchData();
  };

  const test = async (key: string) => {
    if (!tenantId) return;
    setTesting(key);
    try {
      const res = await fetch(`${API_URL}/v1/integrations/${tenantId}/${key}/test`, { method: 'POST' });
      const data = await res.json();
      const status = data.result?.status;
      setTestResult(prev => ({
        ...prev,
        [key]: status === 'created'
          ? { ok: true, msg: 'Test lead created successfully' }
          : status === 'duplicate'
          ? { ok: true, msg: 'Test lead already exists (duplicate — dedup working)' }
          : { ok: false, msg: `Unexpected result: ${JSON.stringify(data.result)}` },
      }));
    } catch {
      setTestResult(prev => ({ ...prev, [key]: { ok: false, msg: 'Test request failed' } }));
    }
    setTesting(null);
  };

  const regenerateSecret = async (key: string): Promise<string> => {
    if (!tenantId) return '';
    const res = await fetch(`${API_URL}/v1/integrations/${tenantId}/${key}/regenerate-secret`, { method: 'POST' });
    return (await res.json()).webhook_secret || '';
  };

  const connectedKeys = new Set(connected.map(c => c.integration_key));

  const actions = (
    <button
      onClick={fetchData}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  );

  return (
    <AppShell title="Integrations" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Lead Source Integrations</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Connect external platforms. Every incoming lead triggers the AI call pipeline automatically.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('add')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Source
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Connected', value: connected.length, color: 'bg-teal-500', icon: '🔗' },
            { label: 'Events Today', value: logs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length, color: 'bg-sky-500', icon: '📥' },
            { label: 'Leads Created', value: logs.filter(l => l.status === 'success').length, color: 'bg-emerald-500', icon: '✅' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 ${s.color} rounded-xl flex items-center justify-center shadow-sm`}>
                  <span className="text-sm">{s.icon}</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100 dark:border-slate-700">
            {([
              { key: 'connected', label: `Connected (${connected.length})` },
              { key: 'add',       label: 'Add Source' },
              { key: 'logs',      label: 'Event Logs' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading integrations...</span>
              </div>
            ) : (
              <>
                {/* ── Connected ── */}
                {activeTab === 'connected' && (
                  <div className="space-y-3">
                    {connected.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
                          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                          </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No integrations connected yet</p>
                        <p className="text-xs text-slate-400 mt-1 mb-4">Connect a lead source to start receiving leads automatically</p>
                        <button
                          onClick={() => setActiveTab('add')}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-xl transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Connect your first source
                        </button>
                      </div>
                    ) : (
                      connected.map(integration => {
                        const meta = getPlatformMeta(integration.integration_key);
                        const tr = testResult[integration.integration_key];
                        return (
                          <div key={integration.id} className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                            {/* Header row */}
                            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl border ${meta.bg} flex items-center justify-center shrink-0 text-lg`}>
                                  {meta.emoji}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{integration.label}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                      integration.status === 'active'
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {integration.status === 'active' && (
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                      )}
                                      {integration.status}
                                    </span>
                                    <span className="text-[11px] text-slate-400 capitalize">{integration.integration_type}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => test(integration.integration_key)}
                                  disabled={testing === integration.integration_key}
                                  className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-teal-300 dark:hover:border-teal-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {testing === integration.integration_key ? 'Testing...' : 'Test'}
                                </button>
                                <button
                                  onClick={() => disconnect(integration.integration_key, integration.label)}
                                  className="px-3 py-1.5 text-xs font-medium bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 hover:bg-red-100 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                                >
                                  Disconnect
                                </button>
                              </div>
                            </div>

                            {/* Test result */}
                            {tr && (
                              <div className={`mx-4 mt-3 flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
                                tr.ok
                                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'
                                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800'
                              }`}>
                                {tr.ok
                                  ? <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                  : <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                                }
                                {tr.msg}
                              </div>
                            )}

                            {/* Webhook details */}
                            <div className="px-4 py-4 space-y-3">
                              <div>
                                <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Webhook URL</p>
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                                  <code className="text-xs font-mono text-teal-700 dark:text-teal-300 break-all flex-1 leading-relaxed">
                                    {integration.webhook_url}
                                  </code>
                                  <CopyButton text={integration.webhook_url} />
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Webhook Secret</p>
                                <SecretReveal callbackFn={() => regenerateSecret(integration.integration_key)} />
                              </div>
                              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Connected {new Date(integration.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ── Add Source ── */}
                {activeTab === 'add' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {supported.map(s => {
                      const isConnected = connectedKeys.has(s.key);
                      const meta = getPlatformMeta(s.key);
                      return (
                        <div
                          key={s.key}
                          className={`flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all ${
                            isConnected
                              ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-700'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-10 h-10 rounded-xl border ${meta.bg} flex items-center justify-center shrink-0 text-xl`}>
                              {meta.emoji}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.label}</p>
                              <p className="text-[11px] text-slate-400 capitalize mt-0.5">{s.type}</p>
                            </div>
                          </div>
                          {isConnected ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                              Connected
                            </span>
                          ) : (
                            <button
                              onClick={() => connect(s.key, s.label)}
                              disabled={connecting === s.key}
                              className="px-3 py-1.5 text-xs font-semibold bg-teal-500 hover:bg-teal-600 disabled:opacity-60 text-white rounded-lg transition-colors shrink-0"
                            >
                              {connecting === s.key ? 'Connecting...' : 'Connect'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Event Logs ── */}
                {activeTab === 'logs' && (
                  logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No events yet</p>
                      <p className="text-xs text-slate-400 mt-1">Events appear when leads arrive via webhook</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-700">
                            {['Source', 'Status', 'Lead ID', 'Error', 'Time'].map(h => (
                              <th key={h} className="text-left pb-3 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                          {logs.map(log => (
                            <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-3 pr-4 font-medium text-slate-700 dark:text-slate-300">{log.integration_key}</td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  log.status === 'success'
                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                    : log.status === 'duplicate'
                                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 pr-4 font-mono text-xs text-slate-400 dark:text-slate-500">
                                {log.lead_id ? log.lead_id.slice(0, 8) + '…' : '—'}
                              </td>
                              <td className="py-3 pr-4 text-xs text-red-500 max-w-[200px] truncate">
                                {log.error_message || '—'}
                              </td>
                              <td className="py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
