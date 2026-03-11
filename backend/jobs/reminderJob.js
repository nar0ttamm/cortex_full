/**
 * Appointment Reminder Job
 *
 * Runs every hour. Finds leads with scheduled appointments and sends
 * WhatsApp reminders at:
 *   - 24 hours before appointment (if reminder_1day_sent = false)
 *   - 3 hours before appointment  (if reminder_3hr_sent = false)
 *
 * Updates the reminder flags after sending so reminders are not duplicated.
 */

const db = require('../db');
const { sendAppointmentReminder } = require('../services/notificationService');

async function runReminderJob() {
  const now = new Date();

  // Fetch all leads with a scheduled appointment and at least one unsent reminder
  const result = await db.query(
    `SELECT id, tenant_id, name, phone, metadata
     FROM leads
     WHERE metadata->>'appointment_status' = 'Scheduled'
       AND metadata->>'appointment_date' IS NOT NULL
       AND (
         (metadata->>'reminder_1day_sent')::boolean = false
         OR (metadata->>'reminder_3hr_sent')::boolean = false
       )`
  );

  const leads = result.rows;
  console.log(`[reminderJob] Checking ${leads.length} lead(s) with upcoming appointments`);

  let sent1day = 0;
  let sent3hr = 0;
  let errors = 0;

  for (const lead of leads) {
    const meta = lead.metadata || {};
    const appointmentDate = meta.appointment_date ? new Date(meta.appointment_date) : null;
    if (!appointmentDate) continue;

    const msUntil = appointmentDate.getTime() - now.getTime();
    const hoursUntil = msUntil / (1000 * 60 * 60);

    if (hoursUntil < 0) continue; // Appointment already passed

    const metaUpdates = {};

    // 24-hour reminder window: between 23h and 25h before
    if (!meta.reminder_1day_sent && hoursUntil >= 23 && hoursUntil <= 25) {
      try {
        await sendAppointmentReminder({ tenantId: lead.tenant_id, lead, hoursUntil: 24 });
        metaUpdates.reminder_1day_sent = true;
        sent1day++;
        console.log(`[reminderJob] 24h reminder sent to lead ${lead.id}`);
      } catch (err) {
        errors++;
        console.error(`[reminderJob] 24h reminder failed for lead ${lead.id}:`, err.message);
      }
    }

    // 3-hour reminder window: between 2.5h and 3.5h before
    if (!meta.reminder_3hr_sent && hoursUntil >= 2.5 && hoursUntil <= 3.5) {
      try {
        await sendAppointmentReminder({ tenantId: lead.tenant_id, lead, hoursUntil: 3 });
        metaUpdates.reminder_3hr_sent = true;
        sent3hr++;
        console.log(`[reminderJob] 3h reminder sent to lead ${lead.id}`);
      } catch (err) {
        errors++;
        console.error(`[reminderJob] 3h reminder failed for lead ${lead.id}:`, err.message);
      }
    }

    if (Object.keys(metaUpdates).length > 0) {
      await db.query(
        'UPDATE leads SET metadata = metadata || $1::jsonb, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(metaUpdates), lead.id]
      );
    }
  }

  return { sent_1day: sent1day, sent_3hr: sent3hr, errors, total_checked: leads.length };
}

module.exports = { runReminderJob };
