// API route for dashboard statistics — Supabase only (multitenant)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsFromSupabase } from '@/lib/supabase-client';
import { DashboardStats } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const leads = await getLeadsFromSupabase(tenantId);

    const totalLeads = leads.length;
    const activeCalls = leads.filter((l: any) =>
      l.ai_call_status === 'Pending' || l.ai_call_status === 'In Progress'
    ).length;

    const today = new Date().toISOString().split('T')[0];
    const appointmentsToday = leads.filter((l: any) =>
      l.appointment_date && l.appointment_date.startsWith(today) && l.appointment_status === 'Scheduled'
    ).length;

    const interestedLeads = leads.filter((l: any) =>
      l.status?.toLowerCase().includes('interested') || l.call_result === 'interested'
    ).length;

    const confirmedAppointments = leads.filter((l: any) =>
      l.appointment_status === 'Scheduled'
    ).length;

    const conversionRate = totalLeads > 0
      ? parseFloat(((confirmedAppointments / totalLeads) * 100).toFixed(1))
      : 0;

    const newLeads = leads.filter((l: any) => {
      const status = (l.status || '').toLowerCase();
      return status === 'new';
    }).length;

    const notInterestedLeads = leads.filter((l: any) =>
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

    return NextResponse.json({ stats });
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const isBackendUnreachable =
      error.message === 'fetch failed' ||
      error.cause?.code === 'ECONNREFUSED' ||
      error.code === 'ECONNREFUSED';
    const message = isBackendUnreachable
      ? 'Backend API unreachable. Start your backend server (e.g. port 4000) so the CRM can load leads.'
      : error.message || 'Internal server error';
    console.error('[STATS-API] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
