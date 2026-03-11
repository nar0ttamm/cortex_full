'use client';

import { useEffect, useState, useMemo } from 'react';
import { AppShell } from '../components/AppShell';

interface Lead {
  id: string;
  name: string;
  status: string;
  source?: string;
  created_at?: string;
  timestamp?: string;
  metadata?: {
    ai_call_status?: string;
    appointment_status?: string;
    calling_mode?: string;
  };
  ai_call_status?: string;
  appointment_status?: string;
}

const STATUS_COLOR: Record<string, string> = {
  new:                    '#3b82f6',
  interested:             '#14b8a6',
  appointment_scheduled:  '#8b5cf6',
  confirmed:              '#10b981',
  not_interested:         '#ef4444',
  closed:                 '#64748b',
};

const LABEL: Record<string, string> = {
  new:                   'New',
  interested:            'Interested',
  appointment_scheduled: 'Scheduled',
  confirmed:             'Confirmed',
  not_interested:        'Not Interested',
  closed:                'Closed',
};

function BarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-36 pt-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{d.value}</span>
          <div
            className="w-full rounded-t-lg transition-all"
            style={{ height: `${Math.max((d.value / max) * 100, 4)}%`, backgroundColor: d.color, minHeight: d.value ? '4px' : '2px', opacity: d.value ? 1 : 0.3 }}
          />
          <span className="text-[9px] text-slate-400 text-center leading-tight" style={{ maxWidth: '100%', wordBreak: 'break-word' }}>{d.label}</span>
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
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width="90" height="90" viewBox="0 0 90 90">
          {data.map((d, i) => {
            const pct = d.value / total;
            const dash = pct * circ;
            const gap = circ - dash;
            const el = (
              <circle
                key={i}
                cx="45" cy="45" r={r}
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
      <div className="space-y-1.5 min-w-0">
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
        const convRate = i > 0 && steps[i-1].value > 0 ? Math.round((s.value / steps[i-1].value) * 100) : null;
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{s.label}</span>
              <div className="flex items-center gap-2">
                {convRate !== null && <span className="text-[10px] text-slate-400">{convRate}% from prev</span>}
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{s.value}</span>
              </div>
            </div>
            <div className="h-7 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden">
              <div
                className="h-full rounded-lg flex items-center px-3 transition-all"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
        <span className="w-1 h-4 bg-teal-500 rounded-full" />
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchLeads(); }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sheets?action=leads');
      if (!res.ok) return;
      const data = await res.json();
      setLeads(data.leads || []);
    } catch (e) {} finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = leads.length;
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byDay: Record<string, number> = {};
    let callsDone = 0, callsPending = 0, callsFailed = 0;

    leads.forEach(l => {
      const st = (l.status || 'new').toLowerCase().replace(/ /g, '_');
      byStatus[st] = (byStatus[st] || 0) + 1;

      const src = l.source || 'Direct';
      bySource[src] = (bySource[src] || 0) + 1;

      const dt = l.created_at || l.timestamp;
      if (dt) {
        const day = new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        byDay[day] = (byDay[day] || 0) + 1;
      }

      const cs = (l.metadata?.ai_call_status || l.ai_call_status || '').toLowerCase();
      if (cs.includes('completed') || cs.includes('done')) callsDone++;
      else if (cs.includes('fail') || cs.includes('error')) callsFailed++;
      else callsPending++;
    });

    const interested = (byStatus['interested'] || 0) + (byStatus['appointment_scheduled'] || 0) + (byStatus['confirmed'] || 0);
    const converted = byStatus['confirmed'] || 0;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

    // Last 7 days
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
    }
    const trend = days.map(d => ({ label: d.split(' ')[0], value: byDay[d] || 0, color: '#14b8a6' }));

    const statusChart = Object.entries(LABEL).map(([k, label]) => ({
      label, value: byStatus[k] || 0, color: STATUS_COLOR[k] || '#94a3b8',
    })).filter(d => d.value > 0);

    const sourceChart = Object.entries(bySource).slice(0, 6).map(([label, value], i) => ({
      label, value, color: ['#14b8a6','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#64748b'][i % 6],
    }));

    const callChart = [
      { label: 'Done', value: callsDone, color: '#10b981' },
      { label: 'Pending', value: callsPending, color: '#f59e0b' },
      { label: 'Failed', value: callsFailed, color: '#ef4444' },
    ].filter(d => d.value > 0);

    const funnel = [
      { label: 'Total Leads',       value: total,                                      color: '#3b82f6' },
      { label: 'Called',            value: callsDone,                                  color: '#14b8a6' },
      { label: 'Interested',        value: interested,                                 color: '#8b5cf6' },
      { label: 'Appt Scheduled',    value: (byStatus['appointment_scheduled'] || 0) + (byStatus['confirmed'] || 0), color: '#f59e0b' },
      { label: 'Confirmed',         value: byStatus['confirmed'] || 0,                 color: '#10b981' },
    ];

    return { total, interested, converted, conversionRate, trend, statusChart, sourceChart, callChart, funnel };
  }, [leads]);

  const actions = (
    <button onClick={fetchLeads} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  );

  if (loading) {
    return (
      <AppShell title="Analytics" actions={actions}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Analytics" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Leads"      value={stats.total}         color="#3b82f6" />
          <StatCard label="Interested"       value={stats.interested}    sub={`${stats.total > 0 ? Math.round(stats.interested/stats.total*100) : 0}% of total`} color="#8b5cf6" />
          <StatCard label="Confirmed"        value={stats.converted}     color="#10b981" />
          <StatCard label="Conversion Rate"  value={`${stats.conversionRate}%`} sub="New → Confirmed" color="#14b8a6" />
        </div>

        {/* Row 2: Trend + Funnel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Leads — Last 7 Days">
            <BarChart data={stats.trend} />
          </ChartCard>
          <ChartCard title="Conversion Funnel">
            <Funnel steps={stats.funnel} />
          </ChartCard>
        </div>

        {/* Row 3: Status + Source + Calls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <ChartCard title="Lead Status">
            {stats.statusChart.length > 0 ? (
              <DonutChart data={stats.statusChart} />
            ) : <p className="text-xs text-slate-400 py-4 text-center">No data</p>}
          </ChartCard>
          <ChartCard title="Lead Sources">
            {stats.sourceChart.length > 0 ? (
              <BarChart data={stats.sourceChart} />
            ) : <p className="text-xs text-slate-400 py-4 text-center">No data</p>}
          </ChartCard>
          <ChartCard title="AI Call Outcomes">
            {stats.callChart.length > 0 ? (
              <DonutChart data={stats.callChart} />
            ) : <p className="text-xs text-slate-400 py-4 text-center">No calls yet</p>}
          </ChartCard>
        </div>

      </div>
    </AppShell>
  );
}
