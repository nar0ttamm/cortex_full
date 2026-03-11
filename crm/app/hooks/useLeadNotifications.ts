'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface LeadNotification {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

interface NotificationState {
  badge: number;
  toasts: LeadNotification[];
  markSeen: () => void;
  dismissToast: (id: string) => void;
}

export function useLeadNotifications(): NotificationState {
  const [badge, setBadge] = useState(0);
  const [toasts, setToasts] = useState<LeadNotification[]>([]);
  const lastSeenRef = useRef<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const fetchNew = useCallback(async () => {
    try {
      const res = await fetch('/api/sheets?action=leads');
      if (!res.ok) return;
      const data = await res.json();
      const leads: any[] = data.leads || [];

      if (knownIdsRef.current.size === 0) {
        // First load — seed known IDs without alerting
        leads.forEach(l => knownIdsRef.current.add(l.id));
        lastSeenRef.current = leads[0]?.created_at ?? null;
        return;
      }

      const newLeads = leads.filter(l => !knownIdsRef.current.has(l.id));
      if (newLeads.length > 0) {
        newLeads.forEach(l => knownIdsRef.current.add(l.id));
        setBadge(prev => prev + newLeads.length);
        setToasts(prev => [
          ...newLeads.map(l => ({ id: l.id, name: l.name, phone: l.phone, created_at: l.created_at })),
          ...prev,
        ].slice(0, 5));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchNew();
    const interval = setInterval(fetchNew, 30000);
    return () => clearInterval(interval);
  }, [fetchNew]);

  const markSeen = useCallback(() => setBadge(0), []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return { badge, toasts, markSeen, dismissToast };
}
