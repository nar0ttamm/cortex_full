// API route for CSV import — Supabase via Backend API (multitenant)

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createLeadInSupabase } from '@/lib/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await requireAuth();
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'File must contain a header row and at least one data row' }, { status: 400 });
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((header, index) => {
        row[header.toLowerCase()] = values[index] || '';
      });
      return row;
    });

    const leads = rows.map((row: any) => ({
      name: row.name || row['full name'] || '',
      phone: row.phone || row.mobile || '',
      email: row.email || '',
      inquiry: row.inquiry || row.message || row.query || '',
      source: row.source || 'CSV Import',
    }));

    const validLeads = leads.filter(lead => lead.name && lead.phone);

    if (validLeads.length === 0) {
      return NextResponse.json({ error: 'No valid leads found (name and phone are required)' }, { status: 400 });
    }

    let imported = 0;
    const errors: string[] = [];

    for (const lead of validLeads) {
      try {
        await createLeadInSupabase(lead, tenantId);
        imported++;
      } catch (err: any) {
        errors.push(`${lead.name} (${lead.phone}): ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped: validLeads.length - imported,
      total: leads.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    if (error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('[IMPORT-API] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
