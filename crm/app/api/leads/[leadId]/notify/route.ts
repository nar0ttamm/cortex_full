import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ leadId: string }> }
) {
  try {
    const { tenantId } = await requireAuth();
    const { leadId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const type = body.type || 'appointment_booked';

    if (!API_URL) {
      return NextResponse.json({ error: 'API URL not configured' }, { status: 503 });
    }

    const res = await fetch(`${API_URL}/v1/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, lead_id: leadId, type }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'Notification delivery failed' },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal error';
    if (msg.includes('401') || msg.toLowerCase().includes('auth')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
