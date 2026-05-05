'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { NotificationToast } from './NotificationToast';
import { ProjectWizard } from './ProjectWizard';

type Props = {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
};

export function AppShell({ children, title, actions }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [projectWizardOpen, setProjectWizardOpen] = useState(false);

  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed === 'true') setCollapsed(true);
    const savedDark = localStorage.getItem('dark-mode');
    if (savedDark === 'true') {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  const toggleDark = () => {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem('dark-mode', String(next));
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Desktop sidebar — overflow-x-hidden prevents collapsed scroll */}
      <div className={`hidden lg:flex lg:flex-col shrink-0 overflow-x-hidden transition-all duration-200 ${collapsed ? 'lg:w-16' : 'lg:w-[220px]'}`}>
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full shadow-2xl w-[220px]">
            <Sidebar collapsed={false} onToggle={() => {}} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200/70 dark:border-slate-800 px-4 lg:px-5 py-3 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            {/* CortexFlow branding */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-[10px] tracking-wide">CF</span>
              </div>
              <span className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-tight hidden sm:block">CortexFlow</span>
            </div>

            {title && (
              <>
                <span className="text-slate-300 dark:text-slate-600 text-sm hidden sm:block">|</span>
                <h1 className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate hidden sm:block">{title}</h1>
              </>
            )}
            {title && <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate sm:hidden">{title}</h1>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Add New Project button */}
            <button
              onClick={() => setProjectWizardOpen(true)}
              data-action="new-project"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg text-xs font-semibold transition-colors border border-teal-500/20"
              title="Create new project"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5"/><path strokeLinecap="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                </svg>
              )}
            </button>
            {actions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      <NotificationToast />
      <ProjectWizard
        open={projectWizardOpen}
        onClose={() => setProjectWizardOpen(false)}
        onCreated={() => { setProjectWizardOpen(false); }}
      />
    </div>
  );
}
