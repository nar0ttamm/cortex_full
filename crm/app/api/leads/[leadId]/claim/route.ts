import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getBackendAuthHeaders } from '@/lib/backendAuth.server';

export async function POST(
  _request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  try {
    await requireAuth();
    const { leadId } = await context.params;
    const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
    if (!base) return NextResponse.json({ error: 'API URL is not configured' }, { status: 500 });
    const response = await fetch(`${base}/v1/leads/${leadId}/claim`, {
      method: 'POST',
      headers: await getBackendAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Authentication required' ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
