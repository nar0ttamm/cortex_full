const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { seesAllLeads } = require('../services/leadAccess');
const { parseDashboardRange } = require('../services/dateRange');

const router = Router();

function visibility(alias, seesAllParam, userParam) {
  return ` AND ($${seesAllParam}::boolean OR ${alias}.assigned_to IS NULL OR ${alias}.assigned_to = (SELECT id FROM user_profiles WHERE user_id = $${userParam} AND tenant_id = ${alias}.tenant_id LIMIT 1))`;
}

router.get('/analytics/dashboard', asyncHandler(async (req, res) => {
  const range = parseDashboardRange(req.query.from, req.query.to);
  if (!range.ok) return res.status(400).json({ error: range.error });
  const tenantId = req.tenantId;
  if (!tenantId) return res.status(403).json({ error: 'Tenant mismatch' });
  const seesAll = seesAllLeads(req.role);
  const params = [tenantId, range.start.toISOString(), range.endExclusive.toISOString(), seesAll, req.userId || null];
  const leadWhere = `l.tenant_id = $1 AND l.created_at >= $2 AND l.created_at < $3${visibility('l', 4, 5)}`;

  const totals = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE l.status = 'new')::int AS new_leads,
       COUNT(*) FILTER (WHERE l.assigned_to IS NOT NULL)::int AS assigned,
       COUNT(*) FILTER (WHERE l.assigned_to IS NULL)::int AS unassigned,
       COUNT(*) FILTER (WHERE l.status IN ('interested', 'appointment_scheduled', 'confirmed'))::int AS interested,
       COUNT(*) FILTER (WHERE l.status = 'not_interested')::int AS not_interested,
       COUNT(*) FILTER (WHERE l.status = 'confirmed')::int AS confirmed
     FROM leads l
     WHERE ${leadWhere}`,
    params
  );

  const sources = await db.query(
    `SELECT COALESCE(NULLIF(l.source, ''), 'Direct') AS source, COUNT(*)::int AS count
     FROM leads l
     WHERE ${leadWhere}
     GROUP BY 1
     ORDER BY count DESC
     LIMIT 8`,
    params
  );

  const statuses = await db.query(
    `SELECT COALESCE(NULLIF(l.status, ''), 'new') AS status, COUNT(*)::int AS count
     FROM leads l
     WHERE ${leadWhere}
     GROUP BY 1
     ORDER BY count DESC`,
    params
  );

  const callWhere = `c.tenant_id = $1 AND COALESCE(c.started_at, c.created_at) >= $2 AND COALESCE(c.started_at, c.created_at) < $3${visibility('l', 4, 5)}`;
  const calls = await db.query(
    `SELECT
       COUNT(*)::int AS made,
       COUNT(*) FILTER (WHERE c.status IN ('completed', 'ended'))::int AS completed
     FROM calls c
     JOIN leads l ON l.id = c.lead_id AND l.tenant_id = c.tenant_id
     WHERE ${callWhere}`,
    params
  );
  const outcomes = await db.query(
    `SELECT COALESCE(NULLIF(c.outcome, ''), 'unknown') AS outcome, COUNT(*)::int AS count
     FROM calls c
     JOIN leads l ON l.id = c.lead_id AND l.tenant_id = c.tenant_id
     WHERE ${callWhere}
     GROUP BY 1
     ORDER BY count DESC
     LIMIT 12`,
    params
  );

  let appointments = 0;
  try {
    const appointmentResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM appointments a
       JOIN leads l ON l.id = a.lead_id AND l.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.scheduled_at >= $2 AND a.scheduled_at < $3${visibility('l', 4, 5)}`,
      params
    );
    appointments = appointmentResult.rows[0]?.total || 0;
  } catch (err) {
    console.warn('[dashboard] appointments skipped:', err.message);
  }

  let team = [];
  if (seesAll) {
    const teamResult = await db.query(
      `SELECT COALESCE(up.full_name, 'Unassigned') AS name, COUNT(*)::int AS leads
       FROM leads l
       LEFT JOIN user_profiles up ON up.id = l.assigned_to
       WHERE ${leadWhere}
       GROUP BY 1
       ORDER BY leads DESC
       LIMIT 12`,
      params
    );
    team = teamResult.rows;
  }

  const row = totals.rows[0] || {};
  const total = row.total || 0;
  return res.json({
    from: range.from,
    to: range.to,
    timezone: 'Asia/Kolkata',
    leads: {
      total,
      new: row.new_leads || 0,
      assigned: row.assigned || 0,
      unassigned: row.unassigned || 0,
      interested: row.interested || 0,
      not_interested: row.not_interested || 0,
      confirmed: row.confirmed || 0,
      conversion_rate: total > 0 ? Math.round(((row.confirmed || 0) / total) * 1000) / 10 : 0,
    },
    calls: {
      made: calls.rows[0]?.made || 0,
      completed: calls.rows[0]?.completed || 0,
      outcomes: outcomes.rows,
    },
    appointments,
    sources: sources.rows,
    statuses: statuses.rows,
    team,
  });
}));

module.exports = router;
