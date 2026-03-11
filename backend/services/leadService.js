const db = require('../db');

const VALID_STATUSES = ['new', 'contacted', 'interested', 'qualified', 'callback_scheduled', 'not_interested', 'closed'];

const STATUS_TRANSITIONS = {
  new: ['contacted', 'not_interested'],
  contacted: ['interested', 'qualified', 'callback_scheduled', 'not_interested'],
  interested: ['qualified', 'callback_scheduled', 'closed'],
  qualified: ['closed'],
  callback_scheduled: ['contacted', 'interested', 'not_interested'],
  not_interested: [],
  closed: [],
};

async function getLeadById(leadId) {
  const result = await db.query('SELECT * FROM leads WHERE id = $1', [leadId]);
  return result.rows[0] || null;
}

async function getLeadByPhone(tenantId, phone) {
  const result = await db.query(
    'SELECT * FROM leads WHERE tenant_id = $1 AND phone = $2 ORDER BY created_at DESC LIMIT 1',
    [tenantId, phone]
  );
  return result.rows[0] || null;
}

async function updateLeadStatus(leadId, newStatus, notes) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Valid: ${VALID_STATUSES.join(', ')}`);
  }

  const lead = await getLeadById(leadId);
  if (!lead) throw new Error('Lead not found');

  const allowed = STATUS_TRANSITIONS[lead.status] || [];
  if (lead.status !== newStatus && !allowed.includes(newStatus)) {
    throw new Error(`Invalid status transition: ${lead.status} → ${newStatus}`);
  }

  const meta = lead.metadata || {};
  const history = meta.status_history || [];
  history.push({
    from: lead.status,
    to: newStatus,
    timestamp: new Date().toISOString(),
    notes: notes || null,
  });

  const updatedMeta = {
    ...meta,
    status_history: history,
    last_status_change: new Date().toISOString(),
  };

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [newStatus, JSON.stringify(updatedMeta), leadId]
  );
}

async function mergeLeadMetadata(leadId, metadata) {
  const result = await db.query(
    'UPDATE leads SET metadata = metadata || $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING id',
    [JSON.stringify(metadata), leadId]
  );
  if (result.rows.length === 0) throw new Error('Lead not found');
}

async function setLeadMetadata(leadId, metadata) {
  await db.query(
    'UPDATE leads SET metadata = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(metadata), leadId]
  );
}

module.exports = {
  VALID_STATUSES,
  STATUS_TRANSITIONS,
  getLeadById,
  getLeadByPhone,
  updateLeadStatus,
  mergeLeadMetadata,
  setLeadMetadata,
};
