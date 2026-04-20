'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';

interface AppointmentLead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  appointment_date: string;
  appointment_status: string;
  status: string;
  inquiry?: string;
  ai_call_status?: string;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export default function AppointmentsPage() {
  const [leads, setLeads] = useState<AppointmentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date());
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLead, setSelectedLead] = useState<AppointmentLead | null>(null);

  useEffect(() => { fetchLeads(); }, []);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/crm-data?action=leads');
      if (!res.ok) return;
      const data = await res.json();
      const all: any[] = data.leads || [];
      const appts = all.filter((l: any) => {
        const m = l.metadata || {};
        const apptDate = m.appointment_date ?? l.appointment_date;
        const apptStatus = m.appointment_status ?? l.appointment_status;
        return apptDate && apptStatus && apptStatus !== 'Not Scheduled';
      }).map((l: any) => {
        const m = l.metadata || {};
        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          email: l.email,
          appointment_date: m.appointment_date ?? l.appointment_date,
          appointment_status: m.appointment_status ?? l.appointment_status,
          status: l.status,
          inquiry: l.inquiry,
          ai_call_status: m.ai_call_status ?? l.ai_call_status,
        } as AppointmentLead;
      });
      setLeads(appts);

      // auto-select today if has appointments, else first upcoming
      const todayAppts = appts.filter(a => isSameDay(new Date(a.appointment_date), today));
      if (todayAppts.length > 0) {
        setSelectedDate(today);
      } else {
        const future = appts
          .filter(a => new Date(a.appointment_date) >= today)
          .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
        if (future.length > 0) {
          const first = new Date(future[0].appointment_date);
          setSelectedDate(first);
          setViewMonth(new Date(first.getFullYear(), first.getMonth(), 1));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Map date-string → appointments
  const apptMap = useMemo(() => {
    const map = new Map<string, AppointmentLead[]>();
    leads.forEach(l => {
      const key = new Date(l.appointment_date).toDateString();
      const arr = map.get(key) || [];
      arr.push(l);
      map.set(key, arr);
    });
    return map;
  }, [leads]);

  // Build calendar grid
  const calDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0-6
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = Array(firstDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    // pad to 6 rows
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth]);

  const selectedAppts = useMemo(() => {
    if (!selectedDate) return [];
    return apptMap.get(selectedDate.toDateString()) || [];
  }, [selectedDate, apptMap]);

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const STATUS_COLOR: Record<string, string> = {
    Scheduled:  'bg-violet-50 text-violet-700 border-violet-200',
    Confirmed:  'bg-teal-50 text-teal-700 border-teal-200',
    Completed:  'bg-slate-50 text-slate-600 border-slate-200',
    Cancelled:  'bg-red-50 text-red-700 border-red-200',
  };

  const actions = (
    <button onClick={fetchLeads} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      Refresh
    </button>
  );

  if (loading) {
    return (
      <AppShell title="Appointments" actions={actions}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Appointments" actions={actions}>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto">
        <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 xl:items-start">

          {/* Calendar — larger on wide screens */}
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/70 dark:border-slate-700 shadow-md shadow-slate-200/40 dark:shadow-none overflow-hidden w-full xl:w-[min(100%,52rem)] xl:shrink-0 ring-1 ring-slate-100/80 dark:ring-slate-700/50">
            {/* Header */}
            <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-br from-teal-50/90 via-white to-violet-50/50 dark:from-slate-900 dark:via-slate-800 dark:to-teal-950/30">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="text-center">
                <p className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{leads.length} appointment{leads.length !== 1 ? 's' : ''} total</p>
              </div>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-700">
              {DAYS.map(d => (
                <div key={d} className="py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 p-3 sm:p-4 gap-1.5 sm:gap-2 bg-slate-50/40 dark:bg-slate-900/20">
              {calDays.map((date, i) => {
                if (!date) return <div key={i} />;
                const key = date.toDateString();
                const dayAppts = apptMap.get(key) || [];
                const isToday = isSameDay(date, today);
                const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                const hasAppt = dayAppts.length > 0;
                const isPast = date < today && !isToday;

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedDate(date);
                      setSelectedLead(null);
                    }}
                    className={`relative flex flex-col items-center justify-start pt-2.5 pb-3 rounded-2xl min-h-[3.75rem] sm:min-h-[4.25rem] transition-all text-sm sm:text-lg font-semibold
                      ${isSelected
                        ? 'bg-teal-500 text-white shadow-md shadow-teal-200'
                        : isToday
                          ? 'bg-teal-50 text-teal-700 border border-teal-200'
                          : hasAppt
                            ? 'hover:bg-violet-50 text-slate-700'
                            : isPast
                              ? 'text-slate-300 hover:bg-slate-50'
                              : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <span className="leading-none">{date.getDate()}</span>
                    {hasAppt && (
                      <div className="flex gap-0.5 mt-1">
                        {dayAppts.slice(0, 3).map((_, di) => (
                          <span
                            key={di}
                            className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white/70' : 'bg-violet-500'}`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="px-5 pb-4 pt-1 flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500" />Today</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" />Has appointment</span>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Selected date header */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Select a date'}
                </p>
                {selectedDate && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {selectedAppts.length === 0
                      ? 'No appointments'
                      : `${selectedAppts.length} appointment${selectedAppts.length > 1 ? 's' : ''}`}
                  </p>
                )}
              </div>
              {selectedDate && isSameDay(selectedDate, today) && (
                <span className="px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-semibold rounded-full">Today</span>
              )}
            </div>

            {/* Appointment cards for selected date */}
            {selectedAppts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-12 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500 font-medium">
                  {selectedDate ? 'No appointments on this date' : 'Click a date to see appointments'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedAppts.map(appt => {
                  const isExpanded = selectedLead?.id === appt.id;
                  const apptTime = new Date(appt.appointment_date).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit', hour12: true,
                  });
                  return (
                    <div
                      key={appt.id}
                      className={`bg-white dark:bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-all ${
                        isExpanded ? 'border-teal-300 dark:border-teal-600 shadow-teal-100 dark:shadow-teal-900/20' : 'border-slate-200/70 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {/* Card header — lead opens profile; chevron expands details */}
                      <div className="flex items-stretch">
                        <Link
                          href={`/leads/${appt.id}`}
                          className="flex-1 flex items-center gap-3 px-5 py-4 min-w-0 text-left hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors"
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0
                            ${isExpanded ? 'bg-teal-500 text-white' : 'bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'}`}>
                            {appt.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{appt.name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{apptTime} · {appt.phone}</p>
                          </div>
                        </Link>
                        <div className="flex items-center gap-2 shrink-0 pr-3 pl-0">
                          <span className={`hidden sm:inline-flex px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase tracking-wide ${STATUS_COLOR[appt.appointment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {appt.appointment_status}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedLead(isExpanded ? null : appt)}
                            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                          >
                            <svg
                              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="px-5 pb-3 sm:hidden">
                        <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold rounded-full border uppercase tracking-wide ${STATUS_COLOR[appt.appointment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                          {appt.appointment_status}
                        </span>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 px-5 py-4 space-y-4 animate-fadeIn">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <Detail label="Full Name" value={appt.name} />
                            <Detail label="Phone" value={appt.phone} />
                            <Detail label="Email" value={appt.email || '—'} />
                            <Detail label="Lead Status" value={appt.status} />
                            <Detail label="Call Status" value={appt.ai_call_status || 'Pending'} />
                            <Detail label="Appt Time" value={new Date(appt.appointment_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} />
                          </div>
                          {appt.inquiry && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Inquiry</p>
                              <div className="bg-slate-50 rounded-xl border border-slate-100 px-3.5 py-2.5">
                                <p className="text-xs text-slate-700 leading-relaxed">{appt.inquiry}</p>
                              </div>
                            </div>
                          )}
                          <Link
                            href={`/leads/${appt.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                          >
                            View Full Lead Profile →
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upcoming summary */}
            {leads.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700 shadow-sm p-5">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-teal-500 rounded-full" />
                  All Upcoming
                </h3>
                <div className="space-y-2">
                  {leads
                    .filter(l => new Date(l.appointment_date) >= today)
                    .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
                    .slice(0, 5)
                    .map(l => {
                      const d = new Date(l.appointment_date);
                      const isOnSelected = selectedDate ? isSameDay(d, selectedDate) : false;
                      return (
                        <div
                          key={l.id}
                          className={`flex items-stretch gap-1 rounded-xl border transition-colors ${
                            isOnSelected
                              ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
                              : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40'
                          }`}
                        >
                          <Link
                            href={`/leads/${l.id}`}
                            className="flex-1 flex items-center gap-3 px-3.5 py-2.5 min-w-0 text-left rounded-l-xl"
                          >
                            <div className="text-center shrink-0 w-10">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase leading-none">{MONTHS[d.getMonth()].slice(0,3)}</p>
                              <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">{d.getDate()}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{l.name}</p>
                              <p className="text-xs text-slate-400">{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase hidden sm:inline-flex ${STATUS_COLOR[l.appointment_status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {l.appointment_status}
                            </span>
                          </Link>
                          <button
                            type="button"
                            title="Show on calendar"
                            onClick={() => {
                              setSelectedDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                              setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                              setSelectedLead(l);
                            }}
                            className="shrink-0 px-2.5 rounded-r-xl border-l border-slate-100 dark:border-slate-600 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-white/60 dark:hover:bg-slate-600/50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xs font-semibold text-slate-700">{value || '—'}</p>
    </div>
  );
}
