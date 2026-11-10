const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, leadFromCsvRow } = require('../services/csvParse');
const { parseDashboardRange } = require('../services/dateRange');
const { buildTimeline } = require('../services/leadTimeline');
const { validateBoard } = require('../services/leadStatuses');

test('csv parser keeps commas and quotes inside quoted fields', () => {
  const parsed = parseCsv('name,phone,inquiry\n"Sharma, Anil","+91 99999","Said ""hello"", then paused"\n');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows[0].value.name, 'Sharma, Anil');
  assert.equal(parsed.rows[0].value.inquiry, 'Said "hello", then paused');
});

test('csv parser accepts a newline inside a quoted field', () => {
  const parsed = parseCsv('name,phone,inquiry\n"A\nB",999,note\n');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].value.name, 'A\nB');
  assert.equal(leadFromCsvRow(parsed.rows[0].value).phone, '999');
});

test('csv parser rejects an unclosed quote', () => {
  const parsed = parseCsv('name,phone\n"Anil,999\n');
  assert.equal(parsed.ok, false);
});

test('dashboard range is inclusive of the end date in IST', () => {
  const range = parseDashboardRange('2026-11-01', '2026-11-01');
  assert.equal(range.ok, true);
  assert.equal(range.endExclusive.getTime() - range.start.getTime(), 24 * 60 * 60 * 1000);
});

test('dashboard range rejects an inverted interval', () => {
  const range = parseDashboardRange('2026-11-10', '2026-11-01');
  assert.equal(range.ok, false);
});

test('timeline orders newer events first and keeps notes', () => {
  const events = buildTimeline({
    lead: {
      created_at: '2026-11-01T00:00:00.000Z',
      source: 'Website',
      metadata: {
        notes: [{ text: 'Call back Friday', author: 'Meera', timestamp: '2026-11-02T00:00:00.000Z' }],
        status_history: [{ to: 'interested', by: 'user-1', at: '2026-11-03T00:00:00.000Z' }],
      },
    },
    calls: [{ status: 'completed', outcome: 'interested', started_at: '2026-11-04T00:00:00.000Z' }],
  });
  assert.equal(events[0].type, 'call');
  assert.equal(events.some((event) => event.type === 'note' && event.actor === 'Meera'), true);
});

test('a board gets one default status', () => {
  const board = validateBoard([
    { label: 'New', color: 'blue' },
    { label: 'Won', color: 'green', is_default: true },
  ]);
  assert.equal(board.ok, true);
  assert.equal(board.statuses.filter((row) => row.is_default).length, 1);
  assert.equal(board.statuses[1].key, 'won');
});
