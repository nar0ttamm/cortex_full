// TypeScript types for the CRM

/** Live call strip from backend `/v1/calls/event` (voice phases) */
export interface ActiveCallMeta {
  call_id?: string;
  phase?: string;
  label?: string;
  detail?: string | null;
  updated_at?: string;
}

export interface Lead {
  id?: string;
  timestamp?: string;
  name: string;
  phone: string;
  email: string;
  inquiry: string;
  source: string;
  status: string;
  ai_call_status?: string;
  appointment_status?: string;
  appointment_date?: string;
  calendar_event_id?: string;
  call_transcript?: string;
  call_result?: string;
  /** Last AI call: prospect asked to book / schedule (from voice summary JSON). */
  appointment_requested?: boolean;
  reminder_1day_sent?: boolean;
  reminder_3hr_sent?: boolean;
  last_update?: string;
  location?: string;
  /** ISO time for scheduled outbound AI call (metadata.scheduled_call_at) */
  scheduled_call_at?: string | null;
  /** True after dial started or completed */
  call_initiated?: boolean;
  active_call?: ActiveCallMeta | null;
  metadata?: {
    calling_mode?: string;
    [key: string]: any;
  };
}

export interface FollowUp {
  timestamp?: string;
  name: string;
  phone: string;
  email: string;
  inquiry: string;
  status: string;
  follow_up_count?: number;
  last_contact?: string;
  next_follow_up?: string;
}

export interface DashboardStats {
  totalLeads: number;
  activeCalls: number;
  appointmentsToday: number;
  conversionRate: number;
  newLeads: number;
  interestedLeads: number;
  notInterestedLeads: number;
  confirmedAppointments: number;
}

/** Chart series returned with /api/stats (computed server-side) */
export interface DashboardAnalyticsPayload {
  trend: { label: string; value: number; color: string }[];
  funnel: { label: string; value: number; color: string }[];
  statusChart: { label: string; value: number; color: string }[];
  sourceChart: { label: string; value: number; color: string }[];
  callChart: { label: string; value: number; color: string }[];
  analyticsKpis: {
    total: number;
    interested: number;
    converted: number;
    conversionRate: number;
  };
}

export interface RecentActivity {
  type: 'lead' | 'call' | 'appointment' | 'followup';
  message: string;
  timestamp: string;
  leadName?: string;
}

export interface Communication {
  type: 'whatsapp' | 'email' | 'call';
  direction: 'sent' | 'received';
  message?: string;
  subject?: string;
  transcript?: string;
  timestamp: string;
  leadName: string;
  leadPhone: string;
}



