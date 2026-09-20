const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scoreLead } = require('../services/leadScore');
const { deriveNextAction } = require('../services/nextAction');
const { parseCallbackWhen } = require('../services/callbackSchedule');
const { decideProjectAssignment } = require('../services/projectResolver');
const {
  buildConversionMetrics,
  timeToFirstCallSeconds,
  rate,
} = require('../services/conversionAnalytics');

test('score stays null when nothing was discussed', () => {
  const r = scoreLead({ status: 'new' });
  assert.equal(r.score, null);
  assert.equal(r.temperature, null);
  assert.equal(r.explanation, null);
});

test('not interested stays cold and explainable', () => {
  const r = scoreLead({ outcome: 'not_interested' });
  assert.equal(r.score, 10);
  assert.equal(r.temperature, 'cold');
  assert.ok(r.explanation.includes('not interested'));
  assert.equal(r.humanHandoff, false);
});

test('appointment + high intent scores hot with explanation', () => {
  const r = scoreLead({
    outcome: 'appointment_booked',
    interest_level: 'high',
    property_type: '3BHK',
    budget: '1 Cr',
    connected: true,
  });
  assert.ok(r.score >= 81);
  assert.equal(r.temperature, 'hot');
  assert.equal(r.humanHandoff, true);
  assert.ok(r.explanation.includes('Appointment'));
});

test('project: supplied wins', () => {
  const r = decideProjectAssignment({
    supplied: { id: 'p1', name: 'Tower A' },
    activeProjects: [{ id: 'p2', name: 'Tower B' }],
  });
  assert.equal(r.projectId, 'p1');
  assert.equal(r.needsAssignment, false);
  assert.equal(r.resolution, 'explicit');
});

test('project: single active auto-assigns', () => {
  const r = decideProjectAssignment({
    activeProjects: [{ id: 'only', name: 'Default' }],
  });
  assert.equal(r.reason, 'single_active');
  assert.equal(r.projectId, 'only');
});

test('project: multiple without default requires assignment', () => {
  const r = decideProjectAssignment({
    activeProjects: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
  assert.equal(r.needsAssignment, true);
  assert.equal(r.projectId, null);
  assert.equal(r.resolution, 'unresolved');
});

test('project: default wins when multiple exist', () => {
  const r = decideProjectAssignment({
    defaultProject: { id: 'def', name: 'Default' },
    activeProjects: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
  assert.equal(r.projectId, 'def');
  assert.equal(r.resolution, 'default');
  assert.equal(r.needsAssignment, false);
});

test('project: source routing only when map is explicit', () => {
  const r = decideProjectAssignment({
    sourceRouted: { id: 'meta-p', name: 'Meta campaign' },
    activeProjects: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  });
  assert.equal(r.resolution, 'source_routing');
  assert.equal(r.projectId, 'meta-p');
});

test('project: invalid supplied is not remapped by decide', () => {
  const r = decideProjectAssignment({
    activeProjects: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  });
  assert.equal(r.projectId, null);
});

test('callback tomorrow 11am is a future ISO', () => {
  const now = new Date('2026-09-20T06:00:00.000Z');
  const iso = parseCallbackWhen('tomorrow 11:00 am', now, 330);
  assert.ok(iso);
  assert.ok(new Date(iso).getTime() > now.getTime());
});

test('callback with no usable time stays null', () => {
  assert.equal(parseCallbackWhen('maybe later', new Date()), null);
  assert.equal(parseCallbackWhen('Call me later.', new Date()), null);
  assert.equal(parseCallbackWhen('', new Date()), null);
});

test('callback Saturday is a future date without inventing from later', () => {
  const now = new Date('2026-09-20T06:00:00.000Z'); // Sunday
  const iso = parseCallbackWhen('Call me Saturday', now, 330);
  assert.ok(iso);
  assert.ok(new Date(iso).getTime() > now.getTime());
});

test('next action prefers project assignment then appointment', () => {
  assert.equal(deriveNextAction({ needs_project_assignment: true }).key, 'assign_project');
  assert.equal(deriveNextAction({ appointment_status: 'Scheduled', appointment_date: '2026-09-21T10:00:00Z' }).key, 'appointment');
  assert.equal(deriveNextAction({ status: 'not_interested' }).key, 'closed');
  const vague = deriveNextAction({ callback_requested: true });
  assert.equal(vague.key, 'callback');
  assert.equal(vague.at, null);
});

test('time to first call uses real timestamps only', () => {
  assert.equal(timeToFirstCallSeconds({ created_at: '2026-09-20T10:00:00Z' }), null);
  assert.equal(
    timeToFirstCallSeconds({ created_at: '2026-09-20T10:00:00Z', first_call_at: '2026-09-20T10:00:58Z' }),
    58
  );
});

test('dashboard metrics never invent rates or pipeline', () => {
  const empty = buildConversionMetrics([]);
  assert.equal(empty.funnel.leads, 0);
  assert.equal(empty.rates.contactRate, null);
  assert.equal(empty.timeToFirstCall.averageSec, null);
  assert.equal(empty.estimatedPipeline, null);

  const m = buildConversionMetrics([
    {
      id: '1',
      name: 'Rahul',
      source: 'Meta Ads',
      status: 'interested',
      score: 87,
      temperature: 'hot',
      human_handoff: true,
      first_call_at: '2026-09-20T10:01:00Z',
      created_at: '2026-09-20T10:00:00Z',
      ai_call_status: 'Completed',
      appointment_status: 'Scheduled',
    },
  ], { averageDealValue: 1000000 });
  assert.equal(m.funnel.leads, 1);
  assert.equal(m.funnel.called, 1);
  assert.equal(m.sourceFunnel[0].source, 'Meta Ads');
  assert.equal(m.sourceFunnel[0].appointments, 1);
  assert.equal(m.estimatedPipeline, 1000000);
  assert.equal(m.needsAttention[0].name, 'Rahul');
});

test('rate is null when denominator is 0', () => {
  assert.equal(rate(5, 0), null);
  assert.equal(rate(1, 4), 25);
});

test('conversion metrics stay tenant-scoped to the supplied rows', () => {
  const m = buildConversionMetrics([
    { id: 'a', source: 'Website', status: 'new' },
    { id: 'b', source: 'Website', status: 'interested', first_call_at: '2026-09-20T10:00:10Z', created_at: '2026-09-20T10:00:00Z', ai_call_status: 'Completed' },
  ]);
  assert.equal(m.funnel.leads, 2);
  assert.equal(m.funnel.qualified, 1);
  assert.equal(m.sourceFunnel.every((s) => s.source === 'Website'), true);
});

test('missing source is Unknown and missing TTF stays null', () => {
  const m = buildConversionMetrics([{ id: 'x', status: 'new' }]);
  assert.equal(m.sourceFunnel[0].source, 'Unknown');
  assert.equal(m.timeToFirstCall.averageSec, null);
  assert.equal(m.estimatedPipeline, null);
});
