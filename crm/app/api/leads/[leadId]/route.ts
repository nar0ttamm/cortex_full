import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadFromSupabase, updateLeadInSupabase } from '@/lib/supabase-client';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> }
) {
  try {
    const { tenantId } = await requireAuth();
    const { leadId } = await context.params;
    try {
      await getLeadFromSupabase(leadId, tenantId);
    } catch {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    const body = await request.json();
    await updateLeadInSupabase(leadId, body);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API leads PATCH]', error);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
