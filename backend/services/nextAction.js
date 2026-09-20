/**
 * Derive a single next-action state from existing lead + context fields.
 */

const ACTIONS = {
  assign_project: 'Assign project',
  call_now: 'Call now',
  callback: 'Callback scheduled',
  appointment: 'Appointment scheduled',
  human_followup: 'Human follow-up required',
  send_whatsapp: 'Send WhatsApp',
  waiting: 'Waiting for customer',
  nurture: 'Nurture',
  closed: 'Closed / not interested',
};

function deriveNextAction({
  needs_project_assignment,
  human_handoff,
  status,
  appointment_status,
  appointment_date,
  scheduled_call_at,
  callback_time,
  callback_requested,
  next_action_at,
  call_initiated,
  ai_call_status,
} = {}) {
  const st = String(status || '').toLowerCase();
  if (needs_project_assignment) {
    return { key: 'assign_project', label: ACTIONS.assign_project, at: null };
  }
  if (st === 'not_interested' || st === 'closed') {
    return { key: 'closed', label: ACTIONS.closed, at: null };
  }
  if (appointment_status === 'Scheduled' || st === 'appointment_scheduled' || st === 'confirmed') {
    return { key: 'appointment', label: ACTIONS.appointment, at: appointment_date || null };
  }
  if (st === 'callback_scheduled' || scheduled_call_at || callback_time || callback_requested) {
    const at = next_action_at || scheduled_call_at || callback_time || null;
    return { key: 'callback', label: at ? ACTIONS.callback : 'Callback requested', at };
  }
  if (human_handoff) {
    return { key: 'human_followup', label: ACTIONS.human_followup, at: next_action_at || null };
  }
  if (!call_initiated && !String(ai_call_status || '').toLowerCase().includes('completed')) {
    return { key: 'call_now', label: ACTIONS.call_now, at: scheduled_call_at || null };
  }
  if (st === 'interested' || st === 'qualified') {
    return { key: 'human_followup', label: ACTIONS.human_followup, at: next_action_at || null };
  }
  return { key: 'nurture', label: ACTIONS.nurture, at: null };
}

module.exports = { deriveNextAction, ACTIONS };
