'use client';

import { BrandMark } from './BrandMark';

type Props = {
  title?: string;
  subtitle?: string;
  homeHref?: string;
  children?: React.ReactNode;
};

export function AppHeader({
  title = 'CortexFlow AI',
  subtitle = 'AI-powered lead management',
  homeHref = '/',
  children,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-elevated)]/90 shadow-[var(--shadow-sm)] backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <BrandMark href={homeHref} />
            {(title !== 'CortexFlow AI' || subtitle) && (
              <div className="min-w-0 hidden sm:block">
                {title !== 'CortexFlow AI' && (
                  <h1 className="truncate font-serif text-xl text-[var(--fg)]">{title}</h1>
                )}
                {subtitle && <p className="truncate text-xs text-[var(--fg-muted)]">{subtitle}</p>}
              </div>
            )}
          </div>
          {children && (
            <div className="flex min-h-[44px] flex-wrap items-center gap-2 sm:gap-3">
              {children}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
