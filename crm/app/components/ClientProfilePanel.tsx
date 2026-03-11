'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ClientProfilePanel({ open, onClose }: Props) {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        setUser(d.user);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity md:bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col animate-slideInRight border-l border-slate-200 safe-area-right"
        role="dialog"
        aria-label="Profile"
      >
        <div className="p-4 sm:p-6 flex items-center justify-between border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Account</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
            aria-label="Close panel"
          >
            <span className="text-xl leading-none">×</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-teal-500" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-sky-50 to-teal-50 border border-sky-100">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white text-xl font-bold shadow-md">
                  {user?.email ? user.email.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-500">Signed in as</p>
                  <p className="text-slate-800 font-medium truncate" title={user?.email ?? ''}>
                    {user?.email ?? '—'}
                  </p>
                </div>
              </div>
              <div className="space-y-1 text-sm text-slate-600">
                <p>Your leads and data are scoped to your account. Sign out on shared devices.</p>
              </div>
            </div>
          )}
        </div>
        <div className="p-4 sm:p-6 border-t border-slate-100 space-y-2">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 active:bg-slate-300 transition-colors touch-manipulation"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
