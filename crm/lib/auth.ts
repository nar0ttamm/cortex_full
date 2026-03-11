// Supabase Auth helpers — session and tenant (user id = tenant id, or user_metadata.tenant_id for override)

import { createClient } from '@/lib/supabase/server';

export type AuthUser = {
  id: string;
  email?: string;
};

/** Effective tenant_id: user_metadata.tenant_id if set (e.g. for testing), else user.id */
function effectiveTenantId(user: { id: string; user_metadata?: Record<string, unknown> }): string {
  const fromMeta = user.user_metadata?.tenant_id;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  return user.id;
}

/**
 * Get current session and user. Returns null if not authenticated.
 * tenantId = user_metadata.tenant_id (if set) or user.id.
 */
export async function getSession(): Promise<{ user: AuthUser; tenantId: string } | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return {
    user: { id: user.id, email: user.email ?? undefined },
    tenantId: effectiveTenantId(user),
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
