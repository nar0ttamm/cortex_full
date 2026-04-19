import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getLeadFromSupabase } from '@/lib/supabase-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';

export async function POST(
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
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'Note text required' }, { status: 400 });
    }
    if (!API_URL) {
      return NextResponse.json({ error: 'API not configured' }, { status: 503 });
    }
    const res = await fetch(`${API_URL}/v1/leads/${encodeURIComponent(leadId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim(), author: body.author }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to save note' },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[API lead notes POST]', error);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
