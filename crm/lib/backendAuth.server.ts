/**
 * Server-only: attach the cookie session JWT to backend API calls.
 */

import { createClient } from './supabase/server';

export async function getBackendAuthHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    console.warn('[backendAuth.server] could not read session', err);
  }

  return headers;
}
