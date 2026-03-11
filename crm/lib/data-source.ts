// Data source — Supabase only (Google Sheets permanently removed)

import { getLeadsFromSupabase, createLeadInSupabase, updateLeadInSupabase } from './supabase-client';

export async function readLeads(): Promise<any[]> {
  return getLeadsFromSupabase();
}

export async function appendLead(lead: any): Promise<void> {
  await createLeadInSupabase(lead);
}

export async function updateLead(leadId: string, updates: any): Promise<void> {
  await updateLeadInSupabase(leadId, updates);
}
