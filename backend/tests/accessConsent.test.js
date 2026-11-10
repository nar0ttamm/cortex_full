const { test } = require('node:test');
const assert = require('node:assert/strict');
const { channelDecision, normalizeAddress } = require('../services/consent');
const { canViewLead } = require('../services/leadAccess');
const { validateBoard, isAllowedLeadStatus } = require('../services/leadStatuses');

test('opt-out blocks even when a grant is not required', () => {
  const decision = channelDecision({
    channel: 'call',
    consent: { call: 'denied', email: 'granted' },
    requireGrant: false,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'opted_out');
});

test('email consent does not grant a call', () => {
  const decision = channelDecision({
    channel: 'call',
    consent: { email: 'granted' },
    requireGrant: true,
  });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'consent_required');
});

test('unknown call consent is allowed until a tenant requires a grant', () => {
  const decision = channelDecision({ channel: 'whatsapp', consent: {}, requireGrant: false });
  assert.equal(decision.allowed, true);
});

test('suppression wins over a grant', () => {
  const decision = channelDecision({
    channel: 'email',
    consent: { email: 'granted' },
    suppressed: true,
  });
  assert.equal(decision.reason, 'suppressed');
});

test('phone normalization keeps a leading plus', () => {
  assert.equal(normalizeAddress('whatsapp', '+91 70214 33461'), '+917021433461');
  assert.equal(normalizeAddress('email', 'A@Example.com'), 'a@example.com');
});

test('executives cannot see another person\'s assigned lead', () => {
  const lead = { assigned_to: 'profile-a' };
  assert.equal(canViewLead('executive', lead, 'profile-b'), false);
  assert.equal(canViewLead('executive', { assigned_to: null }, 'profile-b'), true);
  assert.equal(canViewLead('admin', lead, 'profile-b'), true);
  assert.equal(canViewLead('manager', lead, null), true);
});

test('status board rejects duplicates and accepts a rename', () => {
  const bad = validateBoard([
    { key: 'new', label: 'New' },
    { key: 'new', label: 'Again' },
  ]);
  assert.equal(bad.ok, false);
  const good = validateBoard([
    { label: 'Site Visit', color: 'amber' },
    { key: 'closed', label: 'Won', color: 'green' },
  ]);
  assert.equal(good.ok, true);
  assert.equal(good.statuses[0].key, 'site_visit');
  assert.equal(isAllowedLeadStatus('site_visit', { lead_statuses: good.statuses }), true);
  assert.equal(isAllowedLeadStatus('made_up', { lead_statuses: good.statuses }), false);
});
