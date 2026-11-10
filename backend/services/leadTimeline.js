function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildTimeline({ lead, calls = [], communications = [], appointments = [] }) {
  const events = [];
  if (lead?.created_at) {
    events.push({
      type: 'created',
      at: lead.created_at,
      title: 'Lead created',
      detail: lead.source ? `Source: ${lead.source}` : null,
      actor: null,
    });
  }
  asArray(lead?.metadata?.status_history).forEach((entry) => {
    const at = entry.at || entry.timestamp;
    if (!at) return;
    events.push({
      type: 'status',
      at,
      title: `Status set to ${entry.to || entry.status || 'unknown'}`,
      detail: entry.from ? `From ${entry.from}` : null,
      actor: entry.by || null,
    });
  });
  asArray(lead?.metadata?.assignment_history).forEach((entry) => {
    if (!entry.at) return;
    events.push({
      type: 'assignment',
      at: entry.at,
      title: entry.action === 'claim' ? 'Lead claimed' : 'Lead assignment changed',
      detail: entry.to ? `Assigned to ${entry.to}` : 'Unassigned',
      actor: entry.by || null,
    });
  });
  asArray(lead?.metadata?.notes).forEach((note) => {
    if (!note.timestamp) return;
    events.push({
      type: 'note',
      at: note.timestamp,
      title: 'Note added',
      detail: note.text || null,
      actor: note.author || null,
    });
  });
  calls.forEach((call) => {
    const at = call.started_at || call.created_at;
    if (!at) return;
    events.push({
      type: 'call',
      at,
      title: `Call ${call.status || 'recorded'}`,
      detail: call.outcome || null,
      actor: null,
    });
  });
  communications.forEach((message) => {
    if (!message.created_at) return;
    events.push({
      type: 'message',
      at: message.created_at,
      title: `${message.channel || 'Message'} ${message.direction || ''}`.trim(),
      detail: message.status || null,
      actor: null,
    });
  });
  appointments.forEach((appointment) => {
    if (!appointment.scheduled_at) return;
    events.push({
      type: 'appointment',
      at: appointment.scheduled_at,
      title: appointment.title || 'Appointment',
      detail: appointment.status || null,
      actor: null,
    });
  });
  return events
    .filter((event) => event.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

module.exports = { buildTimeline };
