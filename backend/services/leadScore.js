/**
 * Deterministic, explainable lead qualification score.
 * Never invents facts: missing signals are simply not added.
 */

const TEMPERATURE = [
  { max: 30, label: 'cold' },
  { max: 60, label: 'warm' },
  { max: 80, label: 'qualified' },
  { max: 100, label: 'hot' },
];

function temperatureFor(score) {
  if (score == null || !Number.isFinite(score)) return null;
  const row = TEMPERATURE.find((t) => score <= t.max) || TEMPERATURE[TEMPERATURE.length - 1];
  return row.label;
}

function labelForTemperature(temp) {
  if (temp === 'hot') return 'Hot';
  if (temp === 'qualified') return 'Qualified';
  if (temp === 'warm') return 'Warm';
  if (temp === 'cold') return 'Cold';
  return null;
}

/**
 * @param {object} input
 * @returns {{ score: number|null, temperature: string|null, signals: string[], humanHandoff: boolean, explanation: string|null }}
 */
function scoreLead(input = {}) {
  const {
    outcome,
    status,
    interest_level,
    timeline,
    budget,
    property_type,
    preferred_location,
    appointment_status,
    appointment_requested,
    callback_requested,
    callback_time,
    last_summary,
    objections = [],
    connected = false,
  } = input;

  const oc = String(outcome || '').toLowerCase();
  const st = String(status || '').toLowerCase();
  const interest = String(interest_level || '').toLowerCase();

  if (oc === 'wrong_number' || oc === 'do_not_call') {
    return pack(6, ['Invalid or do-not-call number']);
  }
  if (oc === 'not_interested' || st === 'not_interested' || interest === 'not_interested') {
    return pack(10, ['Explicitly not interested']);
  }

  const hadConversation = Boolean(
    connected ||
      last_summary ||
      ['interested', 'appointment_booked', 'callback', 'completed'].includes(oc) ||
      interest
  );
  if (!hadConversation) {
    return { score: null, temperature: null, signals: [], humanHandoff: false, explanation: null };
  }

  let score = 18;
  const signals = [];

  if (oc === 'appointment_booked' || appointment_status === 'Scheduled' || appointment_requested) {
    score += 28;
    signals.push('Appointment requested');
  }
  if (oc === 'interested' || interest === 'high') {
    score += 22;
    signals.push('High intent');
  } else if (interest === 'medium') {
    score += 12;
    signals.push('Moderate intent');
  } else if (interest === 'low') {
    score += 4;
    signals.push('Low intent');
  }

  if (['immediate', '1_month', 'within_30_days', '3_months'].includes(String(timeline || ''))) {
    score += 12;
    signals.push('Short purchase timeline');
  } else if (['1_year', 'exploring'].includes(String(timeline || ''))) {
    score -= 8;
    signals.push('Long / exploring timeline');
  }

  if (budget) {
    score += 10;
    signals.push('Budget mentioned');
  }
  if (property_type) {
    score += 8;
    signals.push('Requirement confirmed');
  }
  if (preferred_location) {
    score += 6;
    signals.push('Location confirmed');
  }
  if (oc === 'callback' || callback_requested || callback_time) {
    score += 10;
    signals.push('Callback requested');
  }

  const objectionText = Array.isArray(objections) ? objections.join(' ') : String(objections || '');
  if (/price|budget|cost/i.test(objectionText) && !interest && oc !== 'interested' && oc !== 'appointment_booked') {
    score -= 6;
    signals.push('Price concern without confirmed intent');
  }

  score = Math.max(0, Math.min(100, score));
  return pack(score, signals);
}

function pack(score, signals) {
  const temperature = temperatureFor(score);
  const humanHandoff = score >= 61 || temperature === 'hot' || temperature === 'qualified';
  const explanation = signals.length ? signals.slice(0, 4).join(' + ') : null;
  return { score, temperature, signals, humanHandoff, explanation };
}

module.exports = { scoreLead, temperatureFor, labelForTemperature };
