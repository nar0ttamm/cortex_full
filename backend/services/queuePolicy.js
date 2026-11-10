/**
 * Pure call-queue decisions. Database code in callQueueService and internal.js
 * must follow these results so a failed dial cannot mint a new job.
 */

const OPEN_STATUSES = ['queued', 'retry_scheduled', 'processing', 'calling'];
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function shouldReenqueueLegacyLead(existingStatuses) {
  const statuses = Array.isArray(existingStatuses) ? existingStatuses : [];
  return !statuses.some((status) => status && status !== 'cancelled');
}

function classifyDialError({ status, message } = {}) {
  const code = Number(status) || 0;
  const text = String(message || '').toLowerCase();
  if (code === 409) return { kind: 'conflict', retriable: false };
  if (code === 400 || code === 401 || code === 403 || code === 404 || code === 422) {
    return { kind: 'permanent', retriable: false };
  }
  if (TRANSIENT_HTTP.has(code)) return { kind: 'transient', retriable: true };
  const transientText = ['econnrefused', 'etimedout', 'fetch failed', 'timeout', 'aborterror', 'socket hang up', 'network'];
  if (transientText.some((part) => text.includes(part))) return { kind: 'transient', retriable: true };
  return { kind: 'permanent', retriable: false };
}

function nextQueueStatus({ attemptCount, maxAttempts, retriable }) {
  const attempts = Number(attemptCount) || 0;
  const max = Number(maxAttempts) || 1;
  if (!retriable) return attempts >= max ? 'max_attempts_reached' : 'failed';
  if (attempts >= max) return 'max_attempts_reached';
  return 'retry_scheduled';
}

function retryDelayMinutes(attemptCount) {
  const steps = [15, 60, 180];
  const index = Math.max(0, Math.min(steps.length - 1, (Number(attemptCount) || 1) - 1));
  return steps[index];
}

function attemptsRemaining(attemptCount, maxAttempts) {
  return Math.max(0, (Number(maxAttempts) || 0) - (Number(attemptCount) || 0));
}

module.exports = {
  OPEN_STATUSES,
  shouldReenqueueLegacyLead,
  classifyDialError,
  nextQueueStatus,
  retryDelayMinutes,
  attemptsRemaining,
};
