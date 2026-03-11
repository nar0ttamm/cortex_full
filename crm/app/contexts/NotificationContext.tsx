'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useLeadNotifications, LeadNotification } from '../hooks/useLeadNotifications';

interface Ctx {
  badge: number;
  toasts: LeadNotification[];
  markSeen: () => void;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<Ctx>({ badge: 0, toasts: [], markSeen: () => {}, dismissToast: () => {} });

export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useLeadNotifications();
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export const useNotifications = () => useContext(NotificationContext);
