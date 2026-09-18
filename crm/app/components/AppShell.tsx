'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { NotificationToast } from './NotificationToast';
import { ProjectWizard } from './ProjectWizard';
import { BrandMark } from './BrandMark';
import { ThemeToggle } from './ThemeToggle';

type Props = {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
};

export function AppShell({ children, title, actions }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [projectWizardOpen, setProjectWizardOpen] = useState(false);

  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      <div
        className={`hidden shrink-0 overflow-x-hidden transition-all duration-200 lg:flex lg:flex-col ${
          collapsed ? 'lg:w-16' : 'lg:w-[228px]'
        }`}
      >
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-[var(--bg-ink)]/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[228px] shadow-[var(--shadow-lg)]">
            <Sidebar collapsed={false} onToggle={() => {}} onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)]/90 px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur-xl lg:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="shrink-0 rounded-xl p-2 text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-warm)] lg:hidden"
              aria-label="Open menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <div className="hidden sm:block">
              <BrandMark />
            </div>

            {title && (
              <>
                <span className="hidden text-[var(--border)] sm:block">|</span>
                <h1 className="hidden truncate font-serif text-lg text-[var(--fg)] sm:block">{title}</h1>
                <h1 className="truncate text-sm font-semibold text-[var(--fg)] sm:hidden">{title}</h1>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setProjectWizardOpen(true)}
              data-action="new-project"
              className="hidden items-center gap-1.5 rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white sm:flex"
              title="Create new project"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New project
            </button>
            <ThemeToggle />
            {actions}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <NotificationToast />
      <ProjectWizard
        open={projectWizardOpen}
        onClose={() => setProjectWizardOpen(false)}
        onCreated={() => {
          setProjectWizardOpen(false);
        }}
      />
    </div>
  );
}
