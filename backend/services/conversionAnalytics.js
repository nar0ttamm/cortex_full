/**
 * Conversion funnel + speed-to-lead from real lead/call rows.
 * Missing values stay 0 or null — never fabricated.
 */

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function calledLead(lead) {
  const cs = String(lead.ai_call_status || lead.metadata?.ai_call_status || '').toLowerCase();
  if (cs.includes('completed') || cs.includes('done') || cs.includes('fail')) return true;
  if (lead.call_initiated || lead.metadata?.call_initiated) return true;
  if (lead.first_call_at) return true;
  return false;
}

function connectedLead(lead) {
  const cs = String(lead.ai_call_status || lead.metadata?.ai_call_status || '').toLowerCase();
  const oc = String(lead.call_result || lead.metadata?.call_result || '').toLowerCase();
  if (cs.includes('fail') || ['no_answer', 'user_busy', 'voicemail_or_machine', 'dial_failed', 'technical_failure'].includes(oc)) {
    return false;
  }
  return cs.includes('completed') || cs.includes('done') || Boolean(lead.last_summary);
}

function qualifiedLead(lead) {
  const st = String(lead.status || '').toLowerCase();
  if (['interested', 'qualified', 'appointment_scheduled', 'callback_scheduled', 'confirmed'].includes(st)) return true;
  if ((lead.score || 0) >= 61) return true;
  return String(lead.temperature || '') === 'hot' || String(lead.temperature || '') === 'qualified';
}

function appointmentLead(lead) {
  const st = String(lead.status || '').toLowerCase();
  return (
    lead.appointment_status === 'Scheduled' ||
    st === 'appointment_scheduled' ||
    st === 'confirmed' ||
    Boolean(lead.appointment_date)
  );
}

function confirmedLead(lead) {
  return String(lead.status || '').toLowerCase() === 'confirmed' ||
    String(lead.appointment_status || '').toLowerCase() === 'confirmed';
}

function timeToFirstCallSeconds(lead) {
  const start = lead.created_at || lead.timestamp;
  const first = lead.first_call_at;
  if (!start || !first) return null;
  const ms = new Date(first).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 1000);
}

function rate(num, den) {
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

function buildConversionMetrics(leads = [], { averageDealValue } = {}) {
  const total = leads.length;
  const called = leads.filter(calledLead).length;
  const connected = leads.filter(connectedLead).length;
  const qualified = leads.filter(qualifiedLead).length;
  const appointments = leads.filter(appointmentLead).length;
  const confirmed = leads.filter(confirmedLead).length;

  const ttf = leads.map(timeToFirstCallSeconds).filter((n) => n != null);
  const deal = Number(averageDealValue);
  const estimatedPipeline =
    Number.isFinite(deal) && deal > 0 ? Math.round(deal * (qualified + appointments > qualified ? appointments : qualified)) : null;

  const bySource = {};
  for (const lead of leads) {
    const src = lead.source || 'Unknown';
    if (!bySource[src]) bySource[src] = { source: src, leads: 0, called: 0, qualified: 0, appointments: 0 };
    bySource[src].leads += 1;
    if (calledLead(lead)) bySource[src].called += 1;
    if (qualifiedLead(lead)) bySource[src].qualified += 1;
    if (appointmentLead(lead)) bySource[src].appointments += 1;
  }

  const needsAttention = leads
    .filter((l) => {
      if (l.metadata?.needs_project_assignment) return true;
      if (l.human_handoff) return true;
      if ((l.score || 0) >= 61) return true;
      const next = String(l.next_action || '');
      return next === 'human_followup' || next === 'assign_project' || next === 'callback';
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 8);

  return {
    funnel: {
      leads: total,
      called,
      connected,
      qualified,
      appointments,
      confirmed,
    },
    rates: {
      contactRate: rate(called, total),
      connectRate: rate(connected, called),
      qualificationRate: rate(qualified, connected || called),
      appointmentRate: rate(appointments, qualified || called),
      confirmationRate: rate(confirmed, appointments),
      leadToAppointmentRate: rate(appointments, total),
    },
    timeToFirstCall: {
      sampleSize: ttf.length,
      averageSec: ttf.length ? Math.round(ttf.reduce((a, b) => a + b, 0) / ttf.length) : null,
      medianSec: ttf.length ? Math.round(median(ttf)) : null,
      fastestSec: ttf.length ? Math.min(...ttf) : null,
      slowestSec: ttf.length ? Math.max(...ttf) : null,
    },
    sourceFunnel: Object.values(bySource).sort((a, b) => b.leads - a.leads),
    estimatedPipeline,
    needsAttention: needsAttention.map((l) => ({
      id: l.id,
      name: l.name,
      score: l.score ?? null,
      temperature: l.temperature ?? null,
      next_action: l.next_action ?? null,
      last_summary: l.last_summary ?? null,
      requirement: l.property_type || l.inquiry || null,
      location: l.preferred_location || null,
      human_handoff: Boolean(l.human_handoff),
      needs_project: Boolean(l.metadata?.needs_project_assignment),
      appointment_date: l.appointment_date || null,
    })),
  };
}

module.exports = {
  buildConversionMetrics,
  calledLead,
  connectedLead,
  qualifiedLead,
  appointmentLead,
  timeToFirstCallSeconds,
  rate,
};
