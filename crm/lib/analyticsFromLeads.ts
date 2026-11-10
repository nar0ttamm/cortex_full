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

function trendDays(range?: { from: string; to: string }): { key: string; label: string; bucket: 'day' | 'week' }[] {
  if (!range?.from || !range?.to) {
    const days: { key: string; label: string; bucket: 'day' | 'week' }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      days.push({ key, label: key.slice(8), bucket: 'day' as const });
    }
    return days;
  }
  const start = new Date(`${range.from}T00:00:00+05:30`);
  const end = new Date(`${range.to}T00:00:00+05:30`);
  const span = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const bucket: 'day' | 'week' = span > 31 ? 'week' : 'day';
  const days: { key: string; label: string; bucket: 'day' | 'week' }[] = [];
  const cursor = new Date(start);
  const seen = new Set<string>();
  while (cursor.getTime() <= end.getTime() && days.length < 370) {
    const key = bucket === 'day'
      ? cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      : weekKey(cursor);
    if (!seen.has(key)) {
      seen.add(key);
      days.push({
        key,
        label: bucket === 'day' ? key.slice(8) : key,
        bucket,
      });
    }
    cursor.setTime(cursor.getTime() + 86400000);
  }
  return days;
}

function weekKey(date: Date) {
  const copy = new Date(date);
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1);
  return copy.toISOString().slice(0, 10);
}

function trendKey(value: string | undefined, bucket: 'day' | 'week') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (bucket === 'week') return weekKey(date);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function buildDashboardAnalytics(
  leads: any[],
  range?: { from: string; to: string }
): DashboardAnalyticsPayload {
  const total = leads.length;
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let callsDone = 0;
  let callsPending = 0;
  let callsFailed = 0;

  leads.forEach((l) => {
    const st = (l.status || 'new').toLowerCase().replace(/ /g, '_');
    byStatus[st] = (byStatus[st] || 0) + 1;

    const src = l.source || 'Direct';
    bySource[src] = (bySource[src] || 0) + 1;

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

  const days = trendDays(range);
  const trend = days.map((day) => ({
    label: day.label,
    value: leads.filter((lead) => trendKey(lead.created_at || lead.timestamp, day.bucket) === day.key).length,
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
