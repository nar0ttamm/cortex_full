'use client';

import { useEffect, useState } from 'react';

type TimelineEvent = {
  type: string;
  at: string;
  title: string;
  detail?: string | null;
  actor?: string | null;
};

export function LeadTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const response = await fetch(`/api/leads/${leadId}/timeline`);
      const data = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (!response.ok) setError(data.error || 'Could not load activity');
      else setEvents(data.events || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [leadId]);

  return (
    <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 p-5">
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Activity</h2>
      {loading && <p className="mt-3 text-xs text-slate-500">Loading activity...</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {!loading && !error && events.length === 0 && <p className="mt-3 text-xs text-slate-500">No activity recorded yet.</p>}
      <ol className="mt-3 space-y-3">
        {events.map((event, index) => (
          <li key={`${event.type}-${event.at}-${index}`} className="border-l-2 border-teal-200 dark:border-teal-800 pl-3">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{event.title}</p>
            {event.detail && <p className="text-xs text-slate-500 mt-0.5">{event.detail}</p>}
            <p className="text-[11px] text-slate-400 mt-1">
              {new Date(event.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              {event.actor ? ` · ${event.actor}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
