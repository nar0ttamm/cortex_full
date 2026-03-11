// API route for recent activity — Supabase only (multitenant)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsFromSupabase } from '@/lib/supabase-client';
import { RecentActivity } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const leads = await getLeadsFromSupabase(tenantId);
    const activities: RecentActivity[] = [];

    // Recent leads (newest first)
    leads
      .sort((a: any, b: any) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
      )
      .slice(0, 10)
      .forEach((lead: any) => {
        activities.push({
          type: 'lead',
          message: `New lead: ${lead.name} - ${lead.inquiry || 'No inquiry'}`,
          timestamp: lead.timestamp || new Date().toISOString(),
          leadName: lead.name,
        });
      });

    // Scheduled appointments
    leads
      .filter((l: any) => l.appointment_status === 'Scheduled')
      .sort((a: any, b: any) =>
        new Date(b.appointment_date || 0).getTime() - new Date(a.appointment_date || 0).getTime()
      )
      .slice(0, 5)
      .forEach((lead: any) => {
        activities.push({
          type: 'appointment',
          message: `Appointment scheduled: ${lead.name} on ${lead.appointment_date}`,
          timestamp: lead.appointment_date || new Date().toISOString(),
          leadName: lead.name,
        });
      });

    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 15);

    return NextResponse.json({ activities: sortedActivities });
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
    console.error('[ACTIVITY-API] Error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
