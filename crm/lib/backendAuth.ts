/**
 * Attach the current Supabase access token to backend API calls.
 * Works in Next.js server routes and in the browser.
 */

export async function getBackendAuthHeaders(
  extra?: Record<string, string>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  try {
    if (typeof window === 'undefined') {
      const { createClient } = await import('./supabase/server');
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    } else {
      const { createClient } = await import('./supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
    }
  } catch (err) {
    console.warn('[backendAuth] could not read session', err);
  }

  return headers;
}
