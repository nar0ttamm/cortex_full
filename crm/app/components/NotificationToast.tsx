'use client';

import { useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';

export function NotificationToast() {
  const { toasts, dismissToast } = useNotifications();

  // Auto-dismiss each toast after 7 seconds
  useEffect(() => {
    if (toasts.length === 0) return;
    const latest = toasts[0];
    const timer = setTimeout(() => dismissToast(latest.id), 7000);
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.slice(0, 3).map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 border text-white rounded-2xl px-4 py-3 shadow-2xl min-w-[280px] max-w-[320px] animate-slideIn"
          style={{
            background: t.type === 'appointment'
              ? 'linear-gradient(135deg, #2d1b69 0%, #1e1b4b 100%)'
              : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            borderColor: t.type === 'appointment' ? '#6d28d9' : '#334155',
          }}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${
            t.type === 'appointment' ? 'bg-violet-500' : 'bg-teal-500'
          }`}>
            {t.type === 'appointment' ? '📅' : (t.name?.charAt(0)?.toUpperCase() || '?')}
          </div>
          <div className="flex-1 min-w-0">
            {t.type === 'appointment' ? (
              <>
                <p className="text-xs font-bold text-violet-400 mb-0.5">Appointment Booked</p>
                <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                {t.appointmentDate && (
                  <p className="text-xs text-slate-300 mt-0.5">
                    {new Date(t.appointmentDate).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-teal-400 mb-0.5">New Lead</p>
                <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                <p className="text-xs text-slate-400">{t.phone}</p>
              </>
            )}
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
