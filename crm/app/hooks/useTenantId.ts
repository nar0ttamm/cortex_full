'use client';

import { useEffect, useState } from 'react';

/**
 * Resolved tenant id from the authenticated session (same as server requireAuth).
 */
export function useTenantId(): {
  tenantId: string | null;
  ready: boolean;
  authError: boolean;
} {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((r) => {
        if (r.status === 401) {
          if (!cancelled) setAuthError(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (cancelled || !d) return;
        setTenantId(typeof d.tenantId === 'string' ? d.tenantId : null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tenantId, ready, authError };
}
