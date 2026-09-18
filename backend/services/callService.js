/**
 * Call result helpers — map post-call AI analysis to a normalized result
 * string and a CRM lead status. Provider-agnostic (used by manual/CRM call
 * events and the simulate route).
 */

/**
 * Derive a human-readable call result from AI analysis.
 */
function getCallResult(analysis) {
  if (!analysis) return 'not_interested';
  if (analysis.confirmed_appointment) return 'confirmed';
  if (analysis.interested) return 'interested';
  if (analysis.needs_info) return 'callback_requested';
  return 'not_interested';
}

/**
 * Map a call result string to a lead status.
 */
function callResultToLeadStatus(callResult) {
  const map = {
    confirmed: 'interested',
    interested: 'interested',
    callback_requested: 'callback_scheduled',
    not_interested: 'not_interested',
  };
  return map[callResult] || 'contacted';
}

module.exports = { getCallResult, callResultToLeadStatus };
