/** Human-readable labels for CRM `call_result` / voice outcome codes */

const OUTCOME: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not interested',
  appointment_booked: 'Appointment booked',
  callback_requested: 'Callback requested',
  no_answer: 'No answer',
  user_busy: 'Busy',
  voicemail_or_machine: 'Voicemail / machine',
  dial_failed: 'Dial failed',
  technical_failure: 'Technical issue',
  unknown: 'Unknown',
};

export function formatCallOutcome(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return '—';
  const k = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  return OUTCOME[k] ?? raw;
}
