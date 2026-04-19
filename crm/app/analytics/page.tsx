'use client';

import Link from 'next/link';
import { AppShell } from '../components/AppShell';

/**
 * Charts and KPIs live on the Dashboard (single nav entry). This route stays
 * bookmark-safe without a redirect — open Dashboard analytics section.
 */
export default function AnalyticsPage() {
  return (
    <AppShell title="Analytics" actions={null}>
      <div className="p-6 sm:p-10 max-w-lg mx-auto text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Analytics is on the Dashboard</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Funnels, trends, and exportable charts are in one place with your KPIs. Use the sidebar <strong>Dashboard</strong> link.
        </p>
        <Link
          href="/#dashboard-analytics"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          Open Dashboard analytics
        </Link>
      </div>
    </AppShell>
  );
}
