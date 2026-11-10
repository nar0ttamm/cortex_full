const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldReenqueueLegacyLead,
  classifyDialError,
  nextQueueStatus,
  retryDelayMinutes,
} = require('../services/queuePolicy');

test('a failed queue row blocks legacy re-enqueue', () => {
  assert.equal(shouldReenqueueLegacyLead(['failed']), false);
  assert.equal(shouldReenqueueLegacyLead(['failed', 'failed']), false);
  assert.equal(shouldReenqueueLegacyLead(['max_attempts_reached']), false);
  assert.equal(shouldReenqueueLegacyLead(['calling']), false);
});

test('cancelled rows do not block a fresh enqueue', () => {
  assert.equal(shouldReenqueueLegacyLead(['cancelled']), true);
  assert.equal(shouldReenqueueLegacyLead([]), true);
});

test('HTTP 502 is transient and stops after the attempt cap', () => {
  const classified = classifyDialError({ status: 502, message: 'Voice service error' });
  assert.equal(classified.retriable, true);
  assert.equal(nextQueueStatus({ attemptCount: 1, maxAttempts: 2, retriable: true }), 'retry_scheduled');
  assert.equal(nextQueueStatus({ attemptCount: 2, maxAttempts: 2, retriable: true }), 'max_attempts_reached');
});

test('conflict and validation errors are not retried', () => {
  assert.equal(classifyDialError({ status: 409, message: 'in progress' }).retriable, false);
  assert.equal(classifyDialError({ status: 400, message: 'bad phone' }).retriable, false);
  assert.equal(nextQueueStatus({ attemptCount: 1, maxAttempts: 2, retriable: false }), 'failed');
});

test('retry delay backs off', () => {
  assert.equal(retryDelayMinutes(1), 15);
  assert.equal(retryDelayMinutes(2), 60);
  assert.equal(retryDelayMinutes(5), 180);
});
