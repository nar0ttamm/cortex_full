// API route for dashboard statistics — Supabase + calls table (multitenant)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsFromSupabase } from '@/lib/supabase-client';
import { buildDashboardAnalytics } from '@/lib/analyticsFromLeads';
import { DashboardStats, type DashboardAnalyticsPayload } from '@/types';
import { getBackendAuthHeaders } from '@/lib/backendAuth.server';

async function fetchDashboard(from: string, to: string) {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
  if (!base) return null;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/v1/analytics/dashboard?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: await getBackendAuthHeaders(),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as {
      from: string;
      to: string;
      leads: {
        total: number;
        new: number;
        assigned: number;
        unassigned: number;
        interested: number;
        not_interested: number;
        confirmed: number;
        conversion_rate: number;
      };
      calls: { made: number; completed: number; outcomes: { outcome: string; count: number }[] };
      appointments: number;
      sources: { source: string; count: number }[];
      team: { name: string; leads: number }[];
    };
  } catch {
    return null;
  }
}

function inRange(value: string | undefined, from: string, to: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  const start = new Date(`${from}T00:00:00+05:30`).getTime();
  const end = new Date(`${to}T00:00:00+05:30`).getTime() + 86400000;
  return time >= start && time < end;
}

async function fetchConversion(tenantId: string): Promise<DashboardAnalyticsPayload['conversion']> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
  if (!base) return null;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/v1/analytics/conversion?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: await getBackendAuthHeaders(),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as { conversion?: DashboardAnalyticsPayload['conversion'] };
    return j.conversion ?? null;
  } catch {
    return null;
  }
}

async function fetchCallsActiveCount(tenantId: string): Promise<number> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
  if (!base) return 0;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/v1/calls/${encodeURIComponent(tenantId)}/summary`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: await getBackendAuthHeaders(),
    });
    clearTimeout(t);
    if (!res.ok) return 0;
    const j = (await res.json()) as { active_count?: number };
    return typeof j.active_count === 'number' ? j.active_count : 0;
  } catch {
    return 0;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const from = request.nextUrl.searchParams.get('from') || '';
    const to = request.nextUrl.searchParams.get('to') || '';
    const [leads, activeCallsFromDb, conversion, dashboard] = await Promise.all([
      getLeadsFromSupabase(tenantId),
      fetchCallsActiveCount(tenantId),
      fetchConversion(tenantId),
      fetchDashboard(from, to),
    ]);

    const ranged = dashboard
      ? leads.filter((lead: { created_at?: string; timestamp?: string }) => inRange(lead.created_at || lead.timestamp, dashboard.from, dashboard.to))
      : leads;

    const totalLeads = dashboard?.leads.total ?? ranged.length;
    const activeCalls = activeCallsFromDb;
    const appointmentsToday = dashboard?.appointments ?? leads.filter(
      (l: any) =>
        l.appointment_date &&
        String(l.appointment_date).startsWith(new Date().toISOString().split('T')[0]) &&
        l.appointment_status === 'Scheduled'
    ).length;
    const interestedLeads = dashboard?.leads.interested ?? ranged.filter(
      (l: any) => l.status?.toLowerCase().includes('interested') || l.call_result === 'interested'
    ).length;
    const confirmedAppointments = dashboard?.leads.confirmed ?? ranged.filter((l: any) => l.appointment_status === 'Scheduled').length;
    const conversionRate = dashboard?.leads.conversion_rate ?? (totalLeads > 0
      ? parseFloat(((confirmedAppointments / totalLeads) * 100).toFixed(1))
      : 0);
    const newLeads = dashboard?.leads.new ?? ranged.filter((l: any) => (l.status || '').toLowerCase() === 'new').length;
    const notInterestedLeads = dashboard?.leads.not_interested ?? ranged.filter(
      (l: any) => l.status?.toLowerCase().includes('not_interested') || l.call_result === 'not_interested'
    ).length;

    const stats: DashboardStats = {
      totalLeads,
      activeCalls,
      appointmentsToday,
      conversionRate,
      newLeads,
      interestedLeads,
      notInterestedLeads,
      confirmedAppointments,
      assignedLeads: dashboard?.leads.assigned,
      unassignedLeads: dashboard?.leads.unassigned,
      callsMade: dashboard?.calls.made,
      callsCompleted: dashboard?.calls.completed,
      from: dashboard?.from,
      to: dashboard?.to,
      team: dashboard?.team,
    };

    const analytics: DashboardAnalyticsPayload = {
      ...buildDashboardAnalytics(ranged, dashboard ? { from: dashboard.from, to: dashboard.to } : undefined),
      conversion,
    };
    if (dashboard && dashboard.calls.outcomes.length > 0) {
      analytics.callChart = dashboard.calls.outcomes.map((row) => ({
        label: row.outcome,
        value: row.count,
        color: '#1a6b63',
      }));
    }
    if (dashboard && dashboard.sources.length > 0) {
      analytics.sourceChart = dashboard.sources.map((row, index) => ({
        label: row.source,
        value: row.count,
        color: ['#e24b1b', '#1a6b63', '#c4841d', '#f06a3a', '#6b645b', '#3d9d93'][index % 6],
      }));
    }

    return NextResponse.json({ stats, analytics });
  } catch (error: unknown) {
    const err = error as { message?: string; cause?: { code?: string }; code?: string };
    if (err.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (err.message === 'Tenant mismatch') {
      return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 });
    }
    const isBackendUnreachable =
      err.message === 'fetch failed' ||
      err.cause?.code === 'ECONNREFUSED' ||
      err.code === 'ECONNREFUSED';
    const message = isBackendUnreachable
      ? 'Backend API unreachable. Start your backend server (e.g. port 4000) so the CRM can load leads.'
      : err.message || 'Internal server error';
    console.error('[STATS-API] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
