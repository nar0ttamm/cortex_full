'use client';

import Link from 'next/link';

type Props = {
  title?: string;
  subtitle?: string;
  homeHref?: string;
  children?: React.ReactNode;
};

export function AppHeader({
  title = 'Cortex Flow',
  subtitle = 'AI-Powered Lead Management',
  homeHref = '/',
  children,
}: Props) {
  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-sky-100 shadow-sm sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <Link
            href={homeHref}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity group min-w-0 shrink-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md group-hover:scale-105 transition-transform flex-shrink-0">
              <span className="text-white font-bold text-lg sm:text-xl">CF</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-teal-600 bg-clip-text text-transparent truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs text-slate-500 hidden sm:block truncate">{subtitle}</p>
              )}
            </div>
          </Link>
          {children && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-h-[44px]">
              {children}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
