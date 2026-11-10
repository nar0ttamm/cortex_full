const COLORS = ['blue', 'teal', 'violet', 'green', 'red', 'amber', 'slate'];

/** Board shown when a tenant has not saved its own columns. Matches the current CRM Kanban. */
const DEFAULT_BOARD = [
  { key: 'new', label: 'New', color: 'blue', position: 0, archived: false },
  { key: 'interested', label: 'Interested', color: 'teal', position: 1, archived: false },
  { key: 'appointment_scheduled', label: 'Scheduled', color: 'violet', position: 2, archived: false },
  { key: 'confirmed', label: 'Confirmed', color: 'green', position: 3, archived: false },
  { key: 'not_interested', label: 'Lost', color: 'red', position: 4, archived: false },
];

const ALWAYS_ALLOWED = [
  'new', 'contacted', 'interested', 'qualified', 'callback_scheduled',
  'not_interested', 'closed', 'appointment_scheduled', 'confirmed',
];

function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function boardFromSettings(settings) {
  const saved = settings?.lead_statuses;
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_BOARD.map((row) => ({ ...row }));
  return saved
    .map((row, index) => ({
      key: slug(row.key || row.id),
      label: String(row.label || row.key || 'Status').slice(0, 40),
      color: COLORS.includes(row.color) ? row.color : 'slate',
      position: Number.isFinite(Number(row.position)) ? Number(row.position) : index,
      archived: Boolean(row.archived),
    }))
    .filter((row) => row.key)
    .sort((a, b) => a.position - b.position);
}

function validateBoard(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'At least one status is required' };
  }
  if (input.length > 12) return { ok: false, error: 'A board can have at most 12 statuses' };
  const seen = new Set();
  const statuses = [];
  for (let i = 0; i < input.length; i += 1) {
    const row = input[i] || {};
    const key = slug(row.key || row.label);
    if (!key || key.length > 40) return { ok: false, error: 'Each status needs a short key' };
    if (seen.has(key)) return { ok: false, error: `Duplicate status: ${key}` };
    seen.add(key);
    const label = String(row.label || key).trim().slice(0, 40);
    if (!label) return { ok: false, error: 'Each status needs a label' };
    statuses.push({
      key,
      label,
      color: COLORS.includes(row.color) ? row.color : 'slate',
      position: i,
      archived: Boolean(row.archived),
    });
  }
  const active = statuses.filter((row) => !row.archived);
  if (active.length === 0) return { ok: false, error: 'At least one status must stay active' };
  return { ok: true, statuses };
}

function isAllowedLeadStatus(key, settings) {
  const value = slug(key);
  if (!value) return false;
  if (ALWAYS_ALLOWED.includes(value)) return true;
  return boardFromSettings(settings).some((row) => row.key === value);
}

module.exports = {
  COLORS,
  DEFAULT_BOARD,
  ALWAYS_ALLOWED,
  boardFromSettings,
  validateBoard,
  isAllowedLeadStatus,
  slug,
};
