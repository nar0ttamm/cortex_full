// TypeScript types for the CRM

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
  reminder_1day_sent?: boolean;
  reminder_3hr_sent?: boolean;
  last_update?: string;
  location?: string;
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



