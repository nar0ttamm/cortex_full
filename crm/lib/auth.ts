// Supabase Auth helpers. Tenant comes from user_profiles (same source as the backend JWT check).

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export type AuthUser = {
  id: string;
  email?: string;
};

/**
 * Membership tenant — must match backend/middleware/auth.js resolveTenantForUser.
 * Do not use user_metadata.tenant_id: the backend ignores it, so the dashboard
 * would call /v1/leads/<metadata> and get 403 Tenant mismatch.
 */
async function resolveTenantId(userId: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    try {
      const admin = createAdminClient(url, serviceKey);
      const { data } = await admin
        .from('user_profiles')
        .select('tenant_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (typeof data?.tenant_id === 'string' && data.tenant_id.trim()) {
        return data.tenant_id.trim();
      }
    } catch (err) {
      console.warn('[auth] user_profiles lookup failed', err);
    }
  }
  return userId;
}

/**
 * Get current session and user. Returns null if not authenticated.
 * tenantId = user_profiles.tenant_id, else user.id (legacy owner).
 */
export async function getSession(): Promise<{ user: AuthUser; tenantId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return {
    user: { id: user.id, email: user.email ?? undefined },
    tenantId: await resolveTenantId(user.id),
  };
}

export async function getTenantId(): Promise<string | null> {
  const session = await getSession();
  return session?.tenantId ?? null;
}

/**
 * Require auth; throws if not logged in. Use in API routes.
 */
export async function requireAuth(): Promise<{ user: AuthUser; tenantId: string }> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }
  return { user: session.user, tenantId: session.tenantId };
}
