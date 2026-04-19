// API route for dashboard statistics — Supabase + calls table (multitenant)

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsFromSupabase } from '@/lib/supabase-client';
import { buildDashboardAnalytics } from '@/lib/analyticsFromLeads';
import { DashboardStats, type DashboardAnalyticsPayload } from '@/types';

async function fetchCallsActiveCount(tenantId: string): Promise<number> {
  const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
  if (!base) return 0;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/v1/calls/${encodeURIComponent(tenantId)}/summary`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return 0;
    const j = (await res.json()) as { active_count?: number };
    return typeof j.active_count === 'number' ? j.active_count : 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  try {
    const { tenantId } = await requireAuth();
    const [leads, activeCallsFromDb] = await Promise.all([
      getLeadsFromSupabase(tenantId),
      fetchCallsActiveCount(tenantId),
    ]);

    const totalLeads = leads.length;
    const activeCalls = activeCallsFromDb;

    const today = new Date().toISOString().split('T')[0];
    const appointmentsToday = leads.filter(
      (l: any) =>
        l.appointment_date &&
        String(l.appointment_date).startsWith(today) &&
        l.appointment_status === 'Scheduled'
    ).length;

    const interestedLeads = leads.filter(
      (l: any) =>
        l.status?.toLowerCase().includes('interested') || l.call_result === 'interested'
    ).length;

    const confirmedAppointments = leads.filter((l: any) => l.appointment_status === 'Scheduled').length;

    const conversionRate =
      totalLeads > 0
        ? parseFloat(((confirmedAppointments / totalLeads) * 100).toFixed(1))
        : 0;

    const newLeads = leads.filter((l: any) => {
      const status = (l.status || '').toLowerCase();
      return status === 'new';
    }).length;

    const notInterestedLeads = leads.filter(
      (l: any) =>
        l.status?.toLowerCase().includes('not_interested') || l.call_result === 'not_interested'
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
    };

    const analytics: DashboardAnalyticsPayload = buildDashboardAnalytics(leads);

    return NextResponse.json({ stats, analytics });
  } catch (error: unknown) {
    const err = error as { message?: string; cause?: { code?: string }; code?: string };
    if (err.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
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
