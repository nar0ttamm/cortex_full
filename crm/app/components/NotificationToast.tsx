'use client';

import { useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

export function NotificationToast() {
  const { toasts, dismissToast } = useNotifications();

  // Auto-dismiss after 6 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      dismissToast(toasts[toasts.length - 1].id);
    }, 6000);
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 bg-slate-900 dark:bg-slate-800 border border-slate-700 text-white rounded-2xl px-4 py-3 shadow-2xl min-w-[280px] max-w-[320px] animate-slideIn"
        >
          <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center shrink-0 text-sm font-bold">
            {t.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-teal-400 mb-0.5">New Lead</p>
            <p className="text-sm font-semibold text-white truncate">{t.name}</p>
            <p className="text-xs text-slate-400">{t.phone}</p>
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors mt-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
