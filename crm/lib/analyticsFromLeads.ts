/** Server/client-safe analytics aggregates from flattened lead rows */

import type { DashboardAnalyticsPayload } from '@/types';

const STATUS_COLOR: Record<string, string> = {
  new: '#1a6b63',
  interested: '#e24b1b',
  appointment_scheduled: '#c4841d',
  confirmed: '#1a6b63',
  not_interested: '#6b645b',
  closed: '#a39b92',
};

const LABEL: Record<string, string> = {
  new: 'New',
  interested: 'Interested',
  appointment_scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  not_interested: 'Not Interested',
  closed: 'Closed',
};

const SOURCE_PALETTE = ['#e24b1b', '#1a6b63', '#c4841d', '#f06a3a', '#6b645b', '#3d9d93'];

export function buildDashboardAnalytics(leads: any[]): DashboardAnalyticsPayload {
  const total = leads.length;
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  let callsDone = 0;
  let callsPending = 0;
  let callsFailed = 0;

  leads.forEach((l) => {
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
    if (cs.includes('completed') || cs.includes('done')) callsDone += 1;
    else if (cs.includes('fail') || cs.includes('error')) callsFailed += 1;
    else callsPending += 1;
  });

  const interested =
    (byStatus.interested || 0) +
    (byStatus.appointment_scheduled || 0) +
    (byStatus.confirmed || 0);
  const converted = byStatus.confirmed || 0;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
  }
  const trend = days.map((d) => ({
    label: d.split(' ')[0],
    value: byDay[d] || 0,
    color: '#e24b1b',
  }));

  const statusChart = Object.entries(LABEL)
    .map(([k, label]) => ({
      label,
      value: byStatus[k] || 0,
      color: STATUS_COLOR[k] || '#94a3b8',
    }))
    .filter((d) => d.value > 0);

  const sourceChart = Object.entries(bySource)
    .slice(0, 6)
    .map(([label, value], i) => ({
      label,
      value,
      color: SOURCE_PALETTE[i % SOURCE_PALETTE.length],
    }));

  const callChart = [
    { label: 'Done', value: callsDone, color: '#1a6b63' },
    { label: 'Pending', value: callsPending, color: '#c4841d' },
    { label: 'Failed', value: callsFailed, color: '#e24b1b' },
  ].filter((d) => d.value > 0);

  const funnel = [
    { label: 'Total Leads', value: total, color: '#e24b1b' },
    { label: 'Called', value: callsDone, color: '#1a6b63' },
    { label: 'Interested', value: interested, color: '#c4841d' },
    {
      label: 'Appt Scheduled',
      value: (byStatus.appointment_scheduled || 0) + (byStatus.confirmed || 0),
      color: '#f06a3a',
    },
    { label: 'Confirmed', value: byStatus.confirmed || 0, color: '#1a6b63' },
  ];

  return {
    trend,
    funnel,
    statusChart,
    sourceChart,
    callChart,
    analyticsKpis: {
      total,
      interested,
      converted,
      conversionRate,
    },
  };
}
