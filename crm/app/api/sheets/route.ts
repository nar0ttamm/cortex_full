// API route for CRM data operations — Supabase via Backend API (multitenant)
// NOTE: Route path kept as /api/sheets to avoid breaking existing page calls.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadsFromSupabase, getLeadFromSupabase, createLeadInSupabase, updateLeadInSupabase } from '@/lib/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'leads') {
      const leads = await getLeadsFromSupabase(tenantId);
      return NextResponse.json({ leads });
    }

    if (action === 'lead') {
      const id = request.nextUrl.searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: 'Missing lead id' }, { status: 400 });
      }
      const lead = await getLeadFromSupabase(id, tenantId);
      return NextResponse.json({ lead });
    }

    return NextResponse.json({ error: 'Invalid action. Use ?action=leads or ?action=lead&id=<uuid>' }, { status: 400 });
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[SHEETS-API] GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const body = await request.json();
    const { action, lead, leadId } = body;

    if (action === 'append') {
      await createLeadInSupabase(lead, tenantId);
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const id = lead?.id || leadId;
      if (!id) {
        return NextResponse.json({ error: 'Missing lead id for update' }, { status: 400 });
      }
      await updateLeadInSupabase(id, lead);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[SHEETS-API] POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
