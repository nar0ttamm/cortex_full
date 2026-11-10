// API route for CSV import — Supabase via Backend API (multitenant)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getBackendAuthHeaders } from '@/lib/backendAuth.server';

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || '';
    if (!base) return NextResponse.json({ error: 'API URL is not configured' }, { status: 500 });
    const response = await fetch(`${base}/v1/leads/import`, {
      method: 'POST',
      headers: { ...(await getBackendAuthHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text, commit: true }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json(data, { status: response.status });
    return NextResponse.json({
      success: true,
      imported: data.imported || 0,
      skipped: (data.skipped_existing || 0) + (data.file_duplicates || []).length + (data.invalid || []).length,
      total: (data.imported || 0) + (data.skipped_existing || 0) + (data.invalid || []).length + (data.file_duplicates || []).length,
      errors: [
        ...(data.invalid || []).map((row: { row: number; error: string }) => `Row ${row.row}: ${row.error}`),
        ...(data.file_duplicates || []).map((row: { row: number; error: string }) => `Row ${row.row}: ${row.error}`),
        ...(data.existing || []).map((row: { row: number; name: string; phone: string }) => `Row ${row.row}: ${row.name} (${row.phone}) already exists and was not merged`),
        ...(data.parse_errors || []).map((row: { row: number; error: string }) => `Row ${row.row}: ${row.error}`),
      ],
    });
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[IMPORT-API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
