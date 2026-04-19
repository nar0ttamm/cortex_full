'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from './components/AppShell';
import { DashboardStats as DashboardStatsType, RecentActivity, DashboardAnalyticsPayload } from '@/types';
import { DashboardAnalyticsCharts } from './components/dashboard/DashboardAnalyticsCharts';

const STAT_CONFIGS = [
  { key: 'totalLeads',            label: 'Total Leads',            icon: '👥', color: 'bg-sky-500',     showNew: true  },
  { key: 'newLeads',              label: 'New Leads',              icon: '✨', color: 'bg-cyan-500',    showNew: false },
  { key: 'interestedLeads',       label: 'Interested',             icon: '✅', color: 'bg-teal-500',    showNew: false },
  { key: 'notInterestedLeads',    label: 'Not Interested',         icon: '✕',  color: 'bg-slate-500',   showNew: false },
  { key: 'activeCalls',           label: 'Active Calls',           icon: '📞', color: 'bg-violet-500',  showNew: false },
  { key: 'appointmentsToday',     label: 'Appts Today',            icon: '📅', color: 'bg-pink-500',    showNew: false },
  { key: 'confirmedAppointments', label: 'Confirmed Appts',        icon: '✓',  color: 'bg-emerald-500', showNew: false },
  { key: 'conversionRate',        label: 'Conversion Rate',        icon: '📈', color: 'bg-orange-500',  showNew: false },
] as const;

type StatKey = typeof STAT_CONFIGS[number]['key'];

function getStatValue(stats: DashboardStatsType, key: StatKey): string | number {
  if (key === 'conversionRate') return `${stats.conversionRate}%`;
  return stats[key as keyof DashboardStatsType] as number;
}

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

        // Auto-retry once on transient backend errors (cold starts, timeouts)
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

  const actions = (
    <button
      onClick={() => fetchAll(true)}
      disabled={refreshing}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
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
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          {STAT_CONFIGS.map((cfg) => (
            <div
              key={cfg.key}
              className="bg-white rounded-2xl border border-slate-200/70 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl ${cfg.color} flex items-center justify-center shadow-sm`}>
                  {cfg.icon === '✕' ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : cfg.icon === '✓' ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-base leading-none">{cfg.icon}</span>
                  )}
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
                {getStatValue(stats, cfg.key)}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-1">{cfg.label}</p>
              {cfg.showNew && stats.newLeads > 0 && (
                <span className="inline-flex mt-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-xs font-semibold rounded-full border border-emerald-100">
                  +{stats.newLeads} new
                </span>
              )}
            </div>
          ))}
        </div>

        <DashboardAnalyticsCharts analytics={analytics} />

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Recent Activity */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-teal-500 rounded-full" />
                Recent Activity
              </h2>
              <span className="text-xs text-slate-400 font-medium">{activities.length} events</span>
            </div>
            {activities.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 font-medium">No recent activity</p>
                <p className="text-xs text-slate-400 mt-1">Activity will appear as leads come in</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {activities.slice(0, 8).map((act, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/70 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-3.5 h-3.5 text-teal-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 font-medium leading-snug truncate">{act.message}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{formatTimeAgo(act.timestamp)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Quick Actions */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span className="w-1 h-4 bg-teal-500 rounded-full" />
                Quick Actions
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {[
                { href: '/leads', icon: '👥', label: 'View All Leads', sub: 'Browse and manage pipeline', color: 'bg-sky-50 border-sky-100 hover:bg-sky-100 hover:border-sky-200' },
                { href: '/data', icon: '➕', label: 'Add / Import Leads', sub: 'Manual or CSV bulk import', color: 'bg-teal-50 border-teal-100 hover:bg-teal-100 hover:border-teal-200' },
                { href: '/appointments', icon: '📅', label: 'Appointments Calendar', sub: 'View scheduled appointments', color: 'bg-violet-50 border-violet-100 hover:bg-violet-100 hover:border-violet-200' },
                { href: '/communications', icon: '💬', label: 'Communications', sub: 'View messages & call logs', color: 'bg-orange-50 border-orange-100 hover:bg-orange-100 hover:border-orange-200' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-4 border rounded-xl p-3.5 transition-all group ${item.color}`}
                >
                  <div className="text-xl shrink-0">{item.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-teal-700 transition-colors">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>
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
