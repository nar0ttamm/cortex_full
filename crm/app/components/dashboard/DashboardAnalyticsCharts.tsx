'use client';

import { useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import type { DashboardAnalyticsPayload } from '@/types';

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-36 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
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
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
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
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{d.label}</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const max = steps[0]?.value || 1;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        const convRate =
          i > 0 && steps[i - 1].value > 0 ? Math.round((s.value / steps[i - 1].value) * 100) : null;
        return (
          <div key={i}>
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
          </div>
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
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-4 sm:p-5">
      <p className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl sm:text-3xl font-bold break-words" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
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
};

export function DashboardAnalyticsCharts({ analytics }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const exportChartPng = useCallback((chartId: string, name: string) => {
    const root = typeof document !== 'undefined' ? document.getElementById(chartId) : null;
    if (!root) return;
    const dark = document.documentElement.classList.contains('dark');
    toPng(root as HTMLElement, {
      pixelRatio: 2,
      backgroundColor: dark ? '#1e293b' : '#ffffff',
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

  return (
    <div ref={wrapRef} id="dashboard-analytics" className="space-y-5 scroll-mt-24">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span className="w-1 h-5 bg-violet-500 rounded-full" />
          Analytics & charts
        </h2>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Leads" value={k.total} color="#3b82f6" />
        <StatCard
          label="Interested"
          value={k.interested}
          sub={`${k.total > 0 ? Math.round((k.interested / k.total) * 100) : 0}% of total`}
          color="#8b5cf6"
        />
        <StatCard label="Confirmed" value={k.converted} color="#10b981" />
        <StatCard label="Conversion Rate" value={`${k.conversionRate}%`} sub="New → Confirmed" color="#14b8a6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Leads — Last 7 Days" chartId="chart-trend">
          <BarChart data={analytics.trend} />
        </ChartCard>
        <ChartCard title="Conversion Funnel" chartId="chart-funnel">
          <Funnel steps={analytics.funnel} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <ChartCard title="Lead Status" chartId="chart-status">
          {analytics.statusChart.length > 0 ? (
            <DonutChart data={analytics.statusChart} />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No data</p>
          )}
        </ChartCard>
        <ChartCard title="Lead Sources" chartId="chart-sources">
          {analytics.sourceChart.length > 0 ? (
            <BarChart data={analytics.sourceChart} />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No data</p>
          )}
        </ChartCard>
        <ChartCard title="AI Call Outcomes (lead metadata)" chartId="chart-calls">
          {analytics.callChart.length > 0 ? (
            <DonutChart data={analytics.callChart} />
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No call metadata yet</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
