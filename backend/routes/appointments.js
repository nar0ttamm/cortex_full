const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// POST /v1/appointment/schedule
router.post('/appointment/schedule', asyncHandler(async (req, res) => {
  const { lead_id, appointment_date, appointment_time, location, notes, calendar_event_id } = req.body;

  if (!lead_id || !appointment_date) {
    return res.status(400).json({ error: 'Missing required fields: lead_id, appointment_date' });
  }

  const appointmentDateTime = appointment_time
    ? new Date(`${appointment_date}T${appointment_time}`)
    : new Date(appointment_date);

  if (isNaN(appointmentDateTime.getTime())) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or ISO 8601' });
  }

  if (appointmentDateTime < new Date()) {
    return res.status(400).json({ error: 'Appointment date must be in the future' });
  }

  const leadResult = await db.query(
    'SELECT id, tenant_id, status, metadata FROM leads WHERE id = $1',
    [lead_id]
  );
  if (leadResult.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

  const lead = leadResult.rows[0];
  const meta = lead.metadata || {};

  const updatedMeta = {
    ...meta,
    appointment_status: 'Scheduled',
    appointment_date: appointmentDateTime.toISOString(),
    appointment_location: location || meta.appointment_location || '',
    appointment_notes: notes || meta.appointment_notes || '',
    calendar_event_id: calendar_event_id || meta.calendar_event_id || '',
    reminder_1day_sent: false,
    reminder_3hr_sent: false,
  };

  let newStatus = lead.status;
  if (['new', 'contacted'].includes(lead.status)) newStatus = 'interested';

  await db.query(
    'UPDATE leads SET status = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
    [newStatus, JSON.stringify(updatedMeta), lead_id]
  );

  return res.json({
    status: 'scheduled',
    lead_id,
    appointment_date: appointmentDateTime.toISOString(),
    appointment_status: 'Scheduled',
  });
}));

// POST /v1/appointment/update
router.post('/appointment/update', asyncHandler(async (req, res) => {
  const { lead_id, appointment_date, appointment_time, location, notes, appointment_status, calendar_event_id } = req.body;

  if (!lead_id) return res.status(400).json({ error: 'Missing required field: lead_id' });

  const leadResult = await db.query(
    'SELECT id, metadata FROM leads WHERE id = $1',
    [lead_id]
  );
  if (leadResult.rows.length === 0) return res.status(404).json({ error: 'Lead not found' });

  const meta = { ...(leadResult.rows[0].metadata || {}) };

  if (appointment_date) {
    const dt = appointment_time ? new Date(`${appointment_date}T${appointment_time}`) : new Date(appointment_date);
    if (isNaN(dt.getTime())) return res.status(400).json({ error: 'Invalid date format' });
    meta.appointment_date = dt.toISOString();
  }
  if (appointment_status !== undefined) meta.appointment_status = appointment_status;
  if (location !== undefined) meta.appointment_location = location;
  if (notes !== undefined) meta.appointment_notes = notes;
  if (calendar_event_id !== undefined) meta.calendar_event_id = calendar_event_id;

  await db.query(
    'UPDATE leads SET metadata = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(meta), lead_id]
  );

  return res.json({
    status: 'updated',
    lead_id,
    appointment: {
      date: meta.appointment_date,
      status: meta.appointment_status,
      location: meta.appointment_location,
    },
  });
}));

// GET /v1/appointments/:tenantId
router.get('/appointments/:tenantId', asyncHandler(async (req, res) => {
  const { tenantId } = req.params;
  const { start_date, end_date } = req.query;

  let query = `
    SELECT id, tenant_id, name, phone, email, status, metadata, created_at
    FROM leads
    WHERE tenant_id = $1
      AND metadata->>'appointment_status' = 'Scheduled'
      AND metadata->>'appointment_date' IS NOT NULL
  `;
  const params = [tenantId];
  let idx = 2;

  if (start_date) {
    query += ` AND (metadata->>'appointment_date')::timestamp >= $${idx++}`;
    params.push(start_date);
  }
  if (end_date) {
    query += ` AND (metadata->>'appointment_date')::timestamp <= $${idx++}`;
    params.push(end_date);
  }

  query += ` ORDER BY (metadata->>'appointment_date')::timestamp ASC`;

  const result = await db.query(query, params);

  const appointments = result.rows.map((lead) => ({
    lead_id: lead.id,
    lead_name: lead.name,
    lead_phone: lead.phone,
    lead_email: lead.email,
    appointment_date: lead.metadata?.appointment_date,
    appointment_status: lead.metadata?.appointment_status,
    appointment_location: lead.metadata?.appointment_location,
    appointment_notes: lead.metadata?.appointment_notes,
    calendar_event_id: lead.metadata?.calendar_event_id,
  }));

  return res.json({ appointments, count: appointments.length });
}));

module.exports = router;
