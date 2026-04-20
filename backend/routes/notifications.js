/**
 * POST /v1/notifications/send
 *
 * Manual notification trigger from the CRM.
 * Allows sending appointment or callback WhatsApp/email alerts for a specific lead.
 *
 * Body: { lead_id, tenant_id, type: 'appointment_booked' | 'callback' | 'appointment_reminder' }
 */

const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendAppointmentBookedNotifications,
  sendCallbackNotifications,
  sendAppointmentReminder,
} = require('../services/notificationService');

const router = Router();

router.post('/notifications/send', asyncHandler(async (req, res) => {
  const tenant_id = typeof req.body.tenant_id === 'string' ? req.body.tenant_id.trim() : req.body.tenant_id;
  const lead_id   = typeof req.body.lead_id   === 'string' ? req.body.lead_id.trim()   : req.body.lead_id;
  const { type } = req.body;

  if (!tenant_id || !lead_id || !type) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, lead_id, type' });
  }

  const VALID_TYPES = ['appointment_booked', 'callback', 'appointment_reminder'];
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const result = await db.query(
    'SELECT id, tenant_id, name, phone, email, metadata FROM leads WHERE id = $1 AND tenant_id = $2',
    [lead_id, tenant_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const lead = result.rows[0];
  const meta = lead.metadata || {};

  try {
    if (type === 'appointment_booked') {
      const appointmentIso = meta.appointment_date || meta.proposed_appointment_iso || null;
      await sendAppointmentBookedNotifications({ tenantId: tenant_id, lead, appointmentIso });
      return res.json({ status: 'sent', type, lead_id, channels: ['whatsapp', 'email'] });
    }

    if (type === 'callback') {
      await sendCallbackNotifications({ tenantId: tenant_id, lead });
      return res.json({ status: 'sent', type, lead_id, channels: ['whatsapp'] });
    }

    if (type === 'appointment_reminder') {
      if (!meta.appointment_date) {
        return res.status(400).json({ error: 'No appointment date set for this lead' });
      }
      await sendAppointmentReminder({ tenantId: tenant_id, lead, hoursUntil: 24 });
      return res.json({ status: 'sent', type, lead_id, channels: ['whatsapp'] });
    }
  } catch (err) {
    console.error('[notifications/send]', err.message);
    return res.status(502).json({ error: `Notification delivery failed: ${err.message}` });
  }
}));

module.exports = router;
