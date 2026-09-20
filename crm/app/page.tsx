'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from './components/AppShell';
import { DashboardStats as DashboardStatsType, RecentActivity, DashboardAnalyticsPayload } from '@/types';
import { DashboardAnalyticsCharts } from './components/dashboard/DashboardAnalyticsCharts';

function formatTimeAgo(timestamp: string): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-GB');
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStatsType | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [showProjectPrompt, setShowProjectPrompt] = useState(false);

  const fetchAll = useCallback(async (isRefresh = false, attempt = 1) => {
    try {
      if (isRefresh) setRefreshing(true);
      else { setLoading(true); setError(null); setIsAuthError(false); }

      const [statsRes, activityRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/activity'),
      ]);

      if (statsRes.status === 401) {
        setIsAuthError(true);
        setError('Session expired. Please sign in again.');
        return;
      }

      if (!statsRes.ok) {
        const data = await statsRes.json().catch(() => ({}));
        const msg = data.error || 'Failed to load stats';

        if (attempt === 1 && statsRes.status === 500) {
          setTimeout(() => fetchAll(isRefresh, 2), 2500);
          return;
        }
        throw new Error(msg);
      }

      const statsData = await statsRes.json();
      setStats(statsData.stats);
      setAnalytics(statsData.analytics ?? null);
      setError(null);

      if (activityRes.ok) {
        const actData = await activityRes.json();
        setActivities(actData.activities || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('dashboard') === 'insights') {
      requestAnimationFrame(() => {
        document.getElementById('dashboard-analytics')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
    if (url.searchParams.get('onboarding') === 'complete') {
      setShowProjectPrompt(true);
    }
  }, [stats]);

  const actions = (
    <button
      onClick={() => fetchAll(true)}
      disabled={refreshing}
      className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--fg)] transition-colors hover:border-[var(--accent)]/40 disabled:opacity-50"
    >
      <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {refreshing ? 'Refreshing...' : 'Refresh'}
    </button>
  );

  if (loading) {
    return (
      <AppShell title="Dashboard" actions={actions}>
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading dashboard...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !stats) {
    return (
      <AppShell title="Dashboard" actions={actions}>
        <div className="p-6 flex flex-col items-start gap-3 max-w-sm">
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-4 w-full">
            <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4M12 16h.01"/>
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {isAuthError ? 'Session Expired' : 'Failed to load dashboard'}
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5 leading-snug">
                {error || 'An unexpected error occurred.'}
              </p>
            </div>
          </div>
          {isAuthError ? (
            <Link href="/login" className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold transition-colors">
              Sign In
            </Link>
          ) : (
            <button
              onClick={() => fetchAll()}
              className="px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </button>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8 space-y-8">

        {showProjectPrompt && (
          <div className="relative overflow-hidden rounded-2xl border border-teal-200/60 dark:border-teal-800/40 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 p-5 flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center shrink-0 shadow-md">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-teal-900 dark:text-teal-100">Workspace is ready. Add a team, then a project.</p>
              <p className="text-xs text-teal-700/80 dark:text-teal-300/70 mt-0.5">Teams own people. Projects own campaigns the AI sells. Do teams first so assignment is not a dead-end.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/team"
                onClick={() => setShowProjectPrompt(false)}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors"
              >
                Open Team
              </Link>
              <button onClick={() => setShowProjectPrompt(false)} className="p-1.5 text-teal-600/50 hover:text-teal-700 dark:text-teal-400 rounded-lg transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        )}

        <DashboardAnalyticsCharts
          analytics={analytics}
          newLeads={stats.newLeads}
          activeCalls={stats.activeCalls}
          appointmentsToday={stats.appointmentsToday}
        />

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="w-1 h-4 bg-teal-500 rounded-full" />
                Recent Activity
              </h2>
              <Link href="/leads" className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline">
                {activities.length} events
              </Link>
            </div>
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 font-medium">No recent activity</p>
                <Link href="/data" className="text-xs text-teal-600 font-semibold mt-2 hover:underline">
                  Add a lead to get started
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50 dark:divide-slate-700/80">
                {activities.slice(0, 8).map((act, i) => {
                  const row = (
                    <>
                      <div className="w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-900/40 border border-teal-100 dark:border-teal-800 flex items-center justify-center shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 font-medium leading-snug">{act.message}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatTimeAgo(act.timestamp)}</p>
                      </div>
                    </>
                  );
                  return (
                    <li key={i}>
                      {act.leadId ? (
                        <Link
                          href={`/leads/${act.leadId}`}
                          className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
                        >
                          {row}
                          <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-1">
                            View →
                          </span>
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 px-5 py-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span className="w-1 h-4 bg-teal-500 rounded-full" />
                Quick Actions
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {[
                { href: '/leads', icon: '👥', label: 'View All Leads', sub: 'Browse and manage pipeline', color: 'bg-[var(--bg)] border-[var(--border)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]/30' },
                { href: '/data', icon: '➕', label: 'Add / Import Leads', sub: 'Manual or CSV bulk import', color: 'bg-[var(--bg)] border-[var(--border)] hover:bg-[var(--teal-soft)] hover:border-[var(--teal)]/30' },
                { href: '/calls', icon: '📞', label: 'Calls', sub: 'Live and completed AI calls', color: 'bg-[var(--bg)] border-[var(--border)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]/30' },
                { href: '/appointments', icon: '📅', label: 'Appointments Calendar', sub: 'View scheduled appointments', color: 'bg-[var(--bg)] border-[var(--border)] hover:bg-[var(--gold-soft)] hover:border-[var(--gold)]/30' },
                { href: '/communications', icon: '💬', label: 'Communications', sub: 'View messages & call logs', color: 'bg-[var(--bg)] border-[var(--border)] hover:bg-[var(--accent-soft)] hover:border-[var(--accent)]/30' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 border rounded-xl p-3.5 transition-all group ${item.color}`}
                >
                  <div className="text-xl shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--fg)] group-hover:text-[var(--accent)] transition-colors">{item.label}</p>
                    <p className="text-xs text-[var(--fg-muted)] mt-0.5">{item.sub}</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-teal-400 ml-auto shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
