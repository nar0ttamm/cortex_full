/**
 * Map FreeSWITCH `Hangup-Cause` (and common SIP-ish tokens) → CRM outcome + short summary.
 * Used when the channel tears down before CHANNEL_ANSWER (no STT pipeline).
 */

export interface EarlyHangupResult {
  outcome: 'no_answer' | 'user_busy' | 'voicemail_or_machine' | 'dial_failed';
  summary: string;
}

const CAUSE_ALIASES: Record<string, EarlyHangupResult> = {
  NO_ANSWER: {
    outcome: 'no_answer',
    summary: 'No answer (timeout or unreachable).',
  },
  NO_USER_RESPONSE: {
    outcome: 'no_answer',
    summary: 'No answer (no user response).',
  },
  USER_BUSY: {
    outcome: 'user_busy',
    summary: 'Callee busy.',
  },
  CALL_REJECTED: {
    outcome: 'dial_failed',
    summary: 'Call rejected.',
  },
  NORMAL_TEMPORARY_FAILURE: {
    outcome: 'dial_failed',
    summary: 'Temporary routing failure.',
  },
  NO_ROUTE_DESTINATION: {
    outcome: 'dial_failed',
    summary: 'No route to destination.',
  },
  RECOVERY_ON_TIMER_EXPIRE: {
    outcome: 'no_answer',
    summary: 'Timer expire (often no answer).',
  },
  ORIGINATOR_CANCEL: {
    outcome: 'no_answer',
    summary: 'Cancelled before answer.',
  },
  LOSE_RACE: {
    outcome: 'dial_failed',
    summary: 'Race / failover (lost leg).',
  },
};

/** Voicemail / IVM-style — heuristic; carriers vary. */
const VOICEMAIL_HINTS = /VOICEMAIL|MACHINE|AMD|ANSWERING|MEDIA_TIMEOUT|SUBSCRIBER_ABSENT/i;

export function mapEarlyHangupCause(rawCause: string): EarlyHangupResult {
  const c = (rawCause || '').trim();
  const upper = c.toUpperCase().replace(/\s+/g, '_');

  if (VOICEMAIL_HINTS.test(c) || VOICEMAIL_HINTS.test(upper)) {
    return {
      outcome: 'voicemail_or_machine',
      summary: 'Voicemail or machine / no live answer.',
    };
  }

  if (CAUSE_ALIASES[upper]) {
    return CAUSE_ALIASES[upper];
  }

  if (/BUSY|USER_BUSY/i.test(c)) {
    return { outcome: 'user_busy', summary: `Hangup: ${c || 'busy'}` };
  }
  if (/NO_ANSWER|NOANSWER|NO_REPLY|TIMEOUT/i.test(c)) {
    return { outcome: 'no_answer', summary: `Hangup: ${c || 'no answer'}` };
  }

  return {
    outcome: 'dial_failed',
    summary: c ? `Call ended before answer (${c}).` : 'Call ended before answer.',
  };
}
