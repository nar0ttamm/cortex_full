'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface LeadNotification {
  id: string;
  type: 'new_lead' | 'appointment';
  name: string;
  phone: string;
  created_at: string;
  appointmentDate?: string;
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
  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const scheduledLeadIdsRef = useRef<Set<string>>(new Set());

  const fetchNew = useCallback(async () => {
    try {
      const res = await fetch('/api/crm-data?action=leads');
      if (!res.ok) return;
      const data = await res.json();
      const leads: any[] = data.leads || [];

      if (knownLeadIdsRef.current.size === 0) {
        // First load — seed state without alerting
        leads.forEach(l => {
          knownLeadIdsRef.current.add(l.id);
          if (l.metadata?.appointment_status === 'Scheduled' || l.appointment_status === 'Scheduled') {
            scheduledLeadIdsRef.current.add(l.id);
          }
        });
        return;
      }

      const newToasts: LeadNotification[] = [];

      leads.forEach(l => {
        // New lead
        if (!knownLeadIdsRef.current.has(l.id)) {
          knownLeadIdsRef.current.add(l.id);
          newToasts.push({ id: l.id, type: 'new_lead', name: l.name, phone: l.phone, created_at: l.created_at });
        }

        // New appointment scheduled
        const isScheduled = l.metadata?.appointment_status === 'Scheduled' || l.appointment_status === 'Scheduled';
        if (isScheduled && !scheduledLeadIdsRef.current.has(l.id)) {
          scheduledLeadIdsRef.current.add(l.id);
          const apptDate = l.metadata?.appointment_date || l.appointment_date;
          newToasts.push({
            id: `appt-${l.id}`,
            type: 'appointment',
            name: l.name,
            phone: l.phone,
            created_at: new Date().toISOString(),
            appointmentDate: apptDate,
          });
        }
      });

      if (newToasts.length > 0) {
        const leadCount = newToasts.filter(t => t.type === 'new_lead').length;
        if (leadCount > 0) setBadge(prev => prev + leadCount);
        setToasts(prev => [...newToasts, ...prev].slice(0, 5));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchNew();
    const interval = setInterval(fetchNew, 12000);
    return () => clearInterval(interval);
  }, [fetchNew]);

  const markSeen = useCallback(() => setBadge(0), []);
  const dismissToast = useCallback((id: string) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  return { badge, toasts, markSeen, dismissToast };
}
