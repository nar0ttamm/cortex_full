'use client';

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import { toPng } from 'html-to-image';
import type { DashboardAnalyticsPayload } from '@/types';

const STATUS_HREF: Record<string, string> = {
  New: '/leads?status=new',
  Interested: '/leads?status=interested',
  Scheduled: '/leads?status=appointment_scheduled',
  Confirmed: '/leads?status=confirmed',
  'Not Interested': '/leads?status=not_interested',
  Closed: '/leads?status=closed',
};

const FUNNEL_HREF: Record<string, string> = {
  'Total Leads': '/leads',
  Leads: '/leads',
  Called: '/calls',
  Connected: '/calls',
  Qualified: '/leads?status=interested',
  Interested: '/leads?status=interested',
  Appointments: '/appointments',
  'Appt Scheduled': '/appointments',
  Confirmed: '/leads?status=confirmed',
};

function fmtSeconds(sec: number | null | undefined) {
  if (sec == null) return 'Not tracked';
  if (sec < 90) return `${sec} sec`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

function fmtRate(value: number | null | undefined) {
  return value == null ? 'Not tracked' : `${value}%`;
}

function fmtMoney(value: number | null | undefined) {
  if (value == null) return 'Not available';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

const CALL_HREF: Record<string, string> = {
  Done: '/calls',
  Pending: '/calls',
  Failed: '/calls',
};

function BarChart({
  data,
  hrefFor,
}: {
  data: { label: string; value: number; color: string }[];
  hrefFor?: (label: string) => string | undefined;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-36 pt-2">
      {data.map((d, i) => {
        const href = hrefFor?.(d.label);
        const inner = (
          <>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{d.value}</span>
            <div
              className="w-full rounded-t-lg transition-all duration-500 ease-out"
              style={{
                height: `${Math.max((d.value / max) * 100, 4)}%`,
                backgroundColor: d.color,
                minHeight: d.value ? '4px' : '2px',
                opacity: d.value ? 1 : 0.3,
              }}
            />
            <span
              className="text-[9px] text-slate-400 text-center leading-tight line-clamp-2"
              style={{ wordBreak: 'break-word' }}
            >
              {d.label}
            </span>
          </>
        );
        return href ? (
          <Link
            key={i}
            href={href}
            className="flex-1 flex flex-col items-center gap-1.5 min-w-0 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
          >
            {inner}
          </Link>
        ) : (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({
  data,
  hrefFor,
}: {
  data: { label: string; value: number; color: string }[];
  hrefFor?: (label: string) => string | undefined;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
      <div className="relative shrink-0">
        <svg width="90" height="90" viewBox="0 0 90 90" className="drop-shadow-sm">
          {data.map((d, i) => {
            const pct = d.value / total;
            const dash = pct * circ;
            const gap = circ - dash;
            const el = (
              <circle
                key={i}
                cx="45"
                cy="45"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset * circ}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '45px 45px' }}
              />
            );
            offset += pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{total}</span>
        </div>
      </div>
      <div className="space-y-1.5 min-w-0 w-full sm:flex-1">
        {data.map((d, i) => {
          const href = hrefFor?.(d.label);
          const row = (
            <>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{d.label}</span>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 ml-auto">{d.value}</span>
            </>
          );
          return href ? (
            <Link key={i} href={href} className="flex items-center gap-2 rounded-lg px-1 py-0.5 -mx-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
              {row}
            </Link>
          ) : (
            <div key={i} className="flex items-center gap-2">
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Funnel({
  steps,
  hrefFor,
}: {
  steps: { label: string; value: number; color: string }[];
  hrefFor?: (label: string) => string | undefined;
}) {
  const max = steps[0]?.value || 1;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const convRate =
          i > 0 && steps[i - 1].value > 0 ? Math.round((s.value / steps[i - 1].value) * 100) : null;
        const href = hrefFor?.(s.label);
        const body = (
          <>
            <div className="flex items-center justify-between mb-1 gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{s.label}</span>
              <div className="flex items-center gap-2 shrink-0">
                {convRate !== null && (
                  <span className="text-[10px] text-slate-400 hidden sm:inline">{convRate}% from prev</span>
                )}
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{s.value}</span>
              </div>
            </div>
            <div className="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg flex items-center px-3 transition-all duration-700 ease-out"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: s.color }}
              />
            </div>
          </>
        );
        return href ? (
          <Link key={i} href={href} className="block rounded-lg hover:opacity-90">
            {body}
          </Link>
        ) : (
          <div key={i}>{body}</div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold break-words" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </>
  );
  const cls =
    'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-4 sm:p-5';
  if (href) {
    return (
      <Link href={href} className={`${cls} block hover:border-[var(--accent)]/40 hover:shadow-md transition-all`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

function ChartCard({ title, children, chartId }: { title: string; children: React.ReactNode; chartId: string }) {
  return (
    <div
      id={chartId}
      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-4 sm:p-5 chart-export-root"
    >
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-teal-500 rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

type Props = {
  analytics: DashboardAnalyticsPayload | null;
  newLeads?: number;
  activeCalls?: number;
  appointmentsToday?: number;
};

export function DashboardAnalyticsCharts({
  analytics,
  newLeads = 0,
  activeCalls = 0,
  appointmentsToday = 0,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const exportChartPng = useCallback((chartId: string, name: string) => {
    const root = typeof document !== 'undefined' ? document.getElementById(chartId) : null;
    if (!root) return;
    const dark = document.documentElement.classList.contains('dark');
    toPng(root as HTMLElement, {
      pixelRatio: 2,
              backgroundColor: dark ? '#1a1714' : '#fffdf9',
    })
      .then((dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${name}-${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      })
      .catch(() => {});
  }, []);

  const exportCsv = useCallback(() => {
    if (!analytics) return;
    const rows: string[][] = [
      ['Section', 'Label', 'Value'],
      ...analytics.trend.map((d) => ['Leads last 7d', d.label, String(d.value)]),
      ...analytics.funnel.map((d) => ['Funnel', d.label, String(d.value)]),
      ...analytics.statusChart.map((d) => ['Lead status', d.label, String(d.value)]),
      ...analytics.sourceChart.map((d) => ['Sources', d.label, String(d.value)]),
      ...analytics.callChart.map((d) => ['AI call outcomes', d.label, String(d.value)]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [analytics]);

  if (!analytics) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-600 p-8 text-center text-sm text-slate-500">
        Analytics load when stats are available.
      </div>
    );
  }

  const k = analytics.analyticsKpis;
  const c = analytics.conversion;
  const funnelSteps = c
    ? [
        { label: 'Leads', value: c.funnel.leads, color: '#e24b1b' },
        { label: 'Called', value: c.funnel.called, color: '#1a6b63' },
        { label: 'Connected', value: c.funnel.connected, color: '#0f766e' },
        { label: 'Qualified', value: c.funnel.qualified, color: '#c4841d' },
        { label: 'Appointments', value: c.funnel.appointments, color: '#f06a3a' },
        { label: 'Confirmed', value: c.funnel.confirmed, color: '#1a6b63' },
      ]
    : analytics.funnel;

  return (
    <div
      ref={wrapRef}
      id="dashboard-analytics"
      className="space-y-5 scroll-mt-24 rounded-3xl border border-slate-200/80 dark:border-slate-600/80 bg-gradient-to-br from-white via-slate-50/80 to-teal-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-teal-950/20 p-5 sm:p-6 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <span className="w-1 h-5 bg-gradient-to-b from-violet-500 to-teal-500 rounded-full" />
            Conversion
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Leads contacted, qualified, and converted — not call volume
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportCsv()}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => exportChartPng('chart-trend', 'leads-trend')}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
          >
            Export trend PNG
          </button>
          <button
            type="button"
            onClick={() => exportChartPng('chart-status', 'lead-status')}
            className="text-xs font-semibold px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 border border-teal-100 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors"
          >
            Export status PNG
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard href="/leads" label="Leads in" value={c?.funnel.leads ?? k.total} color="#e24b1b" />
        <StatCard href="/calls" label="Contacted" value={c?.funnel.called ?? newLeads} sub={fmtRate(c?.rates.contactRate)} color="#1a6b63" />
        <StatCard
          href="/leads?status=interested"
          label="Qualified"
          value={c?.funnel.qualified ?? k.interested}
          sub={fmtRate(c?.rates.qualificationRate)}
          color="#1a6b63"
        />
        <StatCard href="/appointments" label="Appointments" value={c?.funnel.appointments ?? appointmentsToday} sub={fmtRate(c?.rates.leadToAppointmentRate)} color="#db2777" />
        <StatCard
          label="Time to first call"
          value={fmtSeconds(c?.timeToFirstCall.averageSec)}
          sub={c?.timeToFirstCall.sampleSize ? `Median ${fmtSeconds(c.timeToFirstCall.medianSec)}` : 'Not tracked yet'}
          color="#7c3aed"
        />
        <StatCard
          href="/leads?status=confirmed"
          label="Confirmed"
          value={c?.funnel.confirmed ?? k.converted}
          sub={fmtRate(c?.rates.confirmationRate)}
          color="#e24b1b"
        />
      </div>

      {c && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <ChartCard title="Needs attention" chartId="chart-attention">
            {c.needsAttention.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No hot or blocked leads right now.</p>
            ) : (
              <div className="space-y-3">
                {c.needsAttention.map((row) => (
                  <Link
                    key={row.id}
                    href={`/leads/${row.id}`}
                    className="block rounded-xl border border-slate-100 dark:border-slate-700 px-3 py-2.5 hover:border-teal-300 dark:hover:border-teal-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
                      <span className="text-xs font-bold text-slate-600">
                        {row.score == null ? '—' : `${row.score}/100`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {[row.requirement, row.location, row.next_action?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Needs review'}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </ChartCard>
          <ChartCard title="Source → opportunities" chartId="chart-source-funnel">
            {c.sourceFunnel.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No source data yet.</p>
            ) : (
              <div className="space-y-3">
                {c.sourceFunnel.slice(0, 6).map((src) => (
                  <Link key={src.source} href={`/leads?source=${encodeURIComponent(src.source)}`} className="block">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <span>{src.source || 'Unknown'}</span>
                      <span>{src.leads} leads</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {src.called} called · {src.qualified} qualified · {src.appointments} appointments
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </ChartCard>
          <ChartCard title="Estimated pipeline" chartId="chart-pipeline">
            <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">
              {c.estimatedPipeline == null ? 'Not configured' : fmtMoney(c.estimatedPipeline)}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {c.estimatedPipeline == null
                ? 'Estimated pipeline — Not configured. Set average deal value in Tenant settings.'
                : 'Estimated pipeline only. Not revenue generated.'}
            </p>
            <p className="text-[11px] text-slate-400 mt-3">Active calls now: {activeCalls}</p>
          </ChartCard>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Leads — Last 7 Days" chartId="chart-trend">
          <BarChart data={analytics.trend} hrefFor={() => '/leads'} />
        </ChartCard>
        <ChartCard title="Conversion Funnel" chartId="chart-funnel">
          <Funnel steps={funnelSteps} hrefFor={(label) => FUNNEL_HREF[label]} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <ChartCard title="Lead Status" chartId="chart-status">
          {analytics.statusChart.length > 0 ? (
            <DonutChart data={analytics.statusChart} hrefFor={(label) => STATUS_HREF[label]} />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No data</p>
          )}
        </ChartCard>
        <ChartCard title="Lead Sources" chartId="chart-sources">
          {analytics.sourceChart.length > 0 ? (
            <BarChart
              data={analytics.sourceChart}
              hrefFor={(label) => `/leads?source=${encodeURIComponent(label)}`}
            />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No data</p>
          )}
        </ChartCard>
        <ChartCard title="AI Call Outcomes (lead metadata)" chartId="chart-calls">
          {analytics.callChart.length > 0 ? (
            <DonutChart data={analytics.callChart} hrefFor={(label) => CALL_HREF[label]} />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No call metadata yet</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
