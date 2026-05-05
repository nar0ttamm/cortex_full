'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useTenantId } from '@/app/hooks/useTenantId';

const API = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

function currentMonthLabel() {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function fmtMinutes(min: number) {
  if (!min || min < 0.01) return '0 min';
  if (min < 1) return `${Math.round(min * 60)}s`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${min % 1 === 0 ? min : min.toFixed(1)} min`;
}

function fmtDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function pct(num: number, den: number) {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

interface Usage {
  calls_attempted: number;
  calls_connected: number;
  call_minutes_used: number;
  failed_calls: number;
  no_answer_calls: number;
  appointments_booked: number;
  callbacks_scheduled: number;
  demo_calls_used: number;
  ai_input_tokens_estimated: number;
  ai_output_tokens_estimated: number;
  whatsapp_messages_sent: number;
  emails_sent: number;
}

interface Analytics {
  summary: {
    total_calls: number;
    pickup_rate_pct: number;
    avg_talk_duration_seconds: number;
    appointments_booked: number;
    avg_tool_calls_per_call: number;
    avg_silence_events: number;
    avg_barge_in_events: number;
    outcomes: Record<string, number>;
  };
}

function StatCard({ label, value, sub, color = 'default' }: {
  label: string; value: string | number; sub?: string;
  color?: 'default' | 'green' | 'red' | 'blue' | 'amber' | 'purple';
}) {
  const colors = {
    default: 'from-slate-800/60 to-slate-800/40 border-slate-700/50',
    green:   'from-emerald-900/40 to-emerald-900/20 border-emerald-700/40',
    red:     'from-red-900/40 to-red-900/20 border-red-700/40',
    blue:    'from-sky-900/40 to-sky-900/20 border-sky-700/40',
    amber:   'from-amber-900/40 to-amber-900/20 border-amber-700/40',
    purple:  'from-violet-900/40 to-violet-900/20 border-violet-700/40',
  };
  const textColors = {
    default: 'text-white',
    green:   'text-emerald-300',
    red:     'text-red-300',
    blue:    'text-sky-300',
    amber:   'text-amber-300',
    purple:  'text-violet-300',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-4 flex flex-col gap-1`}>
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color]} leading-tight`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{label}</h2>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

function OutcomeBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const width = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-36 truncate">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-300 w-8 text-right">{count}</span>
      <span className="text-[11px] text-slate-500 w-10 text-right">{pct(count, total)}</span>
    </div>
  );
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  appointment_booked: { label: 'Appointment Booked', color: 'bg-emerald-500' },
  interested:         { label: 'Interested',          color: 'bg-sky-500' },
  callback:           { label: 'Callback',             color: 'bg-amber-500' },
  not_interested:     { label: 'Not Interested',       color: 'bg-slate-500' },
  no_answer:          { label: 'No Answer',            color: 'bg-slate-600' },
  user_busy:          { label: 'Busy',                 color: 'bg-orange-500' },
  voicemail_or_machine: { label: 'Voicemail',          color: 'bg-slate-500' },
  dial_failed:        { label: 'Dial Failed',          color: 'bg-red-600' },
  technical_failure:  { label: 'Technical Failure',   color: 'bg-red-700' },
  unknown:            { label: 'Unknown',              color: 'bg-slate-700' },
};

export default function UsagePage() {
  const { tenantId, ready } = useTenantId();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !tenantId || !API) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [uRes, aRes] = await Promise.all([
          fetch(`${API}/v1/calls/usage/${encodeURIComponent(tenantId)}`),
          fetch(`${API}/v1/calls/analytics?tenant_id=${encodeURIComponent(tenantId)}&limit=500`),
        ]);

        if (uRes.ok) {
          const d = await uRes.json();
          setUsage(d.usage || {});
        }
        if (aRes.ok) {
          const d = await aRes.json();
          setAnalytics(d);
        }
      } catch {
        setError('Could not load usage data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [tenantId, ready]);

  const u = usage || {} as Usage;
  const a = analytics?.summary;
  const outcomes = a?.outcomes || {};
  const totalOutcomes = Object.values(outcomes).reduce((s, v) => s + v, 0);

  // Estimated costs (rough)
  const minutesUsed = Number(u.call_minutes_used) || 0;
  const estimatedAICost = minutesUsed * 0.15;   // OpenAI Realtime ~$0.15/min
  const estimatedTelCost = minutesUsed * 0.028;  // Telnyx India outbound ~$0.028/min
  const estimatedTotal = estimatedAICost + estimatedTelCost;

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Usage</h1>
            <p className="text-sm text-slate-400 mt-0.5">{currentMonthLabel()} · Current month</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-8">
            {[3, 4, 3].map((cols, i) => (
              <div key={i} className={`grid grid-cols-2 sm:grid-cols-${cols} gap-3`}>
                {Array.from({ length: cols }).map((_, j) => (
                  <div key={j} className="h-20 rounded-2xl bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">

            {/* ── Billing Metrics ── */}
            <div>
              <SectionTitle label="Billing" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <StatCard
                  label="Calls Attempted"
                  value={u.calls_attempted || 0}
                  sub="Total this month"
                />
                <StatCard
                  label="Calls Connected"
                  value={u.calls_connected || 0}
                  sub={u.calls_attempted ? pct(u.calls_connected || 0, u.calls_attempted) + ' connect rate' : undefined}
                  color="green"
                />
                <StatCard
                  label="Call Minutes"
                  value={fmtMinutes(minutesUsed)}
                  sub="Billable (≥10s, rounded 30s)"
                  color="blue"
                />
                <StatCard
                  label="Appointments"
                  value={u.appointments_booked || 0}
                  sub="Booked this month"
                  color="purple"
                />
                <StatCard
                  label="Callbacks"
                  value={u.callbacks_scheduled || 0}
                  sub="Scheduled this month"
                  color="amber"
                />
                <StatCard
                  label="Failed Calls"
                  value={u.failed_calls || 0}
                  sub={`${u.no_answer_calls || 0} no answer`}
                  color="red"
                />
                <StatCard
                  label="WhatsApp Sent"
                  value={u.whatsapp_messages_sent || 0}
                />
                <StatCard
                  label="Emails Sent"
                  value={u.emails_sent || 0}
                />
              </div>
            </div>

            {/* ── Call Quality ── */}
            {a && (
              <div>
                <SectionTitle label="Call Quality" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <StatCard
                    label="Pickup Rate"
                    value={`${a.pickup_rate_pct ?? 0}%`}
                    sub={`${a.total_calls} total sessions`}
                    color={a.pickup_rate_pct >= 50 ? 'green' : 'amber'}
                  />
                  <StatCard
                    label="Avg Call Duration"
                    value={fmtDuration(a.avg_talk_duration_seconds)}
                    sub="Per connected call"
                    color="blue"
                  />
                  <StatCard
                    label="Appointments Booked"
                    value={a.appointments_booked}
                    sub={pct(a.appointments_booked, a.total_calls) + ' of calls'}
                    color="purple"
                  />
                  <StatCard
                    label="Avg Tool Calls"
                    value={a.avg_tool_calls_per_call}
                    sub="Product searches per call"
                  />
                  <StatCard
                    label="Avg Silence Events"
                    value={a.avg_silence_events}
                    sub="Per call (lower is better)"
                    color={Number(a.avg_silence_events) > 2 ? 'amber' : 'default'}
                  />
                  <StatCard
                    label="Avg Barge-ins"
                    value={a.avg_barge_in_events}
                    sub="Interruptions per call"
                  />
                </div>
              </div>
            )}

            {/* ── Outcome Breakdown ── */}
            {totalOutcomes > 0 && (
              <div>
                <SectionTitle label="Outcome Breakdown" />
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  {Object.entries(outcomes)
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, count]) => {
                      const meta = OUTCOME_LABELS[key] || { label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), color: 'bg-slate-500' };
                      return (
                        <OutcomeBar
                          key={key}
                          label={meta.label}
                          count={count}
                          total={totalOutcomes}
                          color={meta.color}
                        />
                      );
                    })}
                </div>
              </div>
            )}

            {/* ── Cost Estimates ── */}
            <div>
              <SectionTitle label="Cost Estimates" />
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-[11px] text-slate-500 mb-4">
                  Estimates only — based on {fmtMinutes(minutesUsed)} of connected call time.
                  Actual charges depend on your OpenAI and Telnyx plans.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider">OpenAI Realtime</span>
                    <span className="text-lg font-bold text-white">${estimatedAICost.toFixed(2)}</span>
                    <span className="text-[11px] text-slate-600">~$0.15/min avg</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider">Telnyx (India)</span>
                    <span className="text-lg font-bold text-white">${estimatedTelCost.toFixed(2)}</span>
                    <span className="text-[11px] text-slate-600">~$0.028/min</span>
                  </div>
                  <div className="flex flex-col gap-1 border-t sm:border-t-0 sm:border-l border-slate-800 sm:pl-4 pt-3 sm:pt-0">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider">Estimated Total</span>
                    <span className="text-lg font-bold text-teal-400">${estimatedTotal.toFixed(2)}</span>
                    <span className="text-[11px] text-slate-600">AI + telecom this month</span>
                  </div>
                </div>

                {(u.ai_input_tokens_estimated || u.ai_output_tokens_estimated) ? (
                  <div className="mt-4 pt-4 border-t border-slate-800 flex gap-6 text-sm">
                    <div>
                      <span className="text-slate-500 text-xs">Input tokens (est.)</span>
                      <p className="font-semibold text-slate-200">{(u.ai_input_tokens_estimated || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 text-xs">Output tokens (est.)</span>
                      <p className="font-semibold text-slate-200">{(u.ai_output_tokens_estimated || 0).toLocaleString()}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {!u.calls_attempted && !a && (
              <div className="text-center py-16">
                <svg className="w-10 h-10 text-slate-700 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                <p className="text-slate-500 text-sm">No usage data yet this month.</p>
                <p className="text-slate-600 text-xs mt-1">Start making AI calls to see metrics here.</p>
              </div>
            )}

          </div>
        )}
      </div>
    </AppShell>
  );
}
