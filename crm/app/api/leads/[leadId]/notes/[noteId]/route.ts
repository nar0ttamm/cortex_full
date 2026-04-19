import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadFromSupabase } from '@/lib/supabase-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ leadId: string; noteId: string }> }
) {
  try {
    const { tenantId } = await requireAuth();
    const { leadId, noteId } = await context.params;
    try {
      await getLeadFromSupabase(leadId, tenantId);
    } catch {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    if (!API_URL) {
      return NextResponse.json({ error: 'API not configured' }, { status: 503 });
    }
    const res = await fetch(
      `${API_URL}/v1/leads/${encodeURIComponent(leadId)}/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: data.error || 'Failed to delete note' },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API lead notes DELETE]', error);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
