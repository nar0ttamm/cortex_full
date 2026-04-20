const db = require('../db');
const config = require('../config');
const { getCredentials } = require('./credentialService');

/** Human-readable delay for WhatsApp/email copy (matches CALL_DELAY_SECONDS). */
function scheduledCallDelayPhrase() {
  const s = config.callDelaySeconds;
  if (s <= 90) return '1 minute';
  const m = Math.ceil(s / 60);
  return m === 1 ? '1 minute' : `${m} minutes`;
}

/**
 * Send email via Resend API.
 * Credentials shape: { api_key, from_email }
 */
async function sendEmail({ tenantId, to, subject, html }) {
  if (!to) return { skipped: true, reason: 'no recipient' };

  const creds = await getCredentials(tenantId, 'resend');
  const fromEmail  = creds.from_email   || 'noreply@cortexflow.ai';
  // reply_to_email routes replies through Resend Inbound so we can log them
  const replyTo    = creds.reply_to_email || null;

  const payload = { from: fromEmail, to, subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.api_key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend error: ${err.message || res.statusText}`);
  }

  return res.json();
}

/**
 * Send WhatsApp message via Twilio.
 * Credentials shape: { account_sid, auth_token, whatsapp_number }
 * whatsapp_number should be in E.164 format e.g. +14155238886
 */
async function sendWhatsApp({ tenantId, to, body }) {
  if (!to) return { skipped: true, reason: 'no recipient' };

  const creds = await getCredentials(tenantId, 'twilio');
  const authHeader =
    'Basic ' + Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64');

  const form = new URLSearchParams({
    From: `whatsapp:${creds.whatsapp_number}`,
    To: `whatsapp:${to}`,
    Body: body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Twilio error: ${err.message || res.statusText}`);
  }

  return res.json();
}

/**
 * Fire all 4 lead-entry notifications in parallel.
 * Failures are logged but do NOT throw — lead save is never blocked by notification errors.
 */
async function sendLeadEntryNotifications({ tenantId, lead, adminEmail, adminPhone }) {
  const leadName = lead.name || 'New Lead';
  const leadPhone = lead.phone || '';
  const leadEmail = lead.email || null;
  const leadInquiry = lead.inquiry || 'No details provided';
  const delayPhrase = scheduledCallDelayPhrase();

  const adminEmailHtml = `
    <h2>New Lead Received</h2>
    <p><strong>Name:</strong> ${leadName}</p>
    <p><strong>Phone:</strong> ${leadPhone}</p>
    <p><strong>Email:</strong> ${leadEmail || 'N/A'}</p>
    <p><strong>Inquiry:</strong> ${leadInquiry}</p>
    <p><strong>Source:</strong> ${lead.source || 'Unknown'}</p>
    <p><em>AI call scheduled in ${delayPhrase}.</em></p>
  `;

  const leadEmailHtml = `
    <h2>Thank you for your interest!</h2>
    <p>Hi ${leadName},</p>
    <p>We have received your inquiry and our team will contact you shortly.</p>
    <p>You will receive a call within the next ${delayPhrase}.</p>
    <br/>
    <p>Best regards,<br/>CortexFlow Team</p>
  `;

  const adminWaBody = `🔔 New Lead Alert!\nName: ${leadName}\nPhone: ${leadPhone}\nInquiry: ${leadInquiry}\nAI call scheduled in ${delayPhrase}.`;

  const leadWaBody = `Hi ${leadName}! 👋 Thank you for your interest. Our AI assistant will call you within the next ${delayPhrase} to learn more about your requirements. Please keep your phone available.`;

  const tasks = [
    sendEmail({ tenantId, to: adminEmail, subject: `New Lead: ${leadName}`, html: adminEmailHtml }),
    sendWhatsApp({ tenantId, to: adminPhone, body: adminWaBody }),
  ];

  if (leadEmail) {
    tasks.push(sendEmail({ tenantId, to: leadEmail, subject: 'Thank you for your inquiry!', html: leadEmailHtml }));
  }

  if (leadPhone) {
    tasks.push(sendWhatsApp({ tenantId, to: leadPhone, body: leadWaBody }));
  }

  const results = await Promise.allSettled(tasks);

  // Log all sends (success or fail) to lead metadata for the Communications page
  const logEntries = [
    { type: 'email',    direction: 'to_admin', subject: `New Lead: ${leadName}`,         status: results[0].status },
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120),        status: results[1].status },
  ];
  if (leadEmail)  logEntries.push({ type: 'email',    direction: 'to_lead', subject: 'Thank you for your inquiry!', status: results[2]?.status || 'skipped' });
  if (leadPhone)  logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120),      status: results[leadEmail ? 3 : 2]?.status || 'skipped' });

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notifications] task ${i} failed:`, r.reason?.message || r.reason);
    }
  });

  // Persist all entries in a single atomic write to avoid race conditions
  if (lead.id) {
    logCommunications(lead.id, logEntries).catch(() => {});
  }
}

/**
 * Append multiple communication log entries atomically (single DB write).
 * Prevents race conditions when logging several notifications at once.
 */
async function logCommunications(leadId, entries) {
  if (!leadId || !entries?.length) return;
  const ts = new Date().toISOString();
  const stamped = entries.map(e => ({ ...e, timestamp: ts }));
  try {
    await db.query(
      `UPDATE leads
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{communications_log}',
         COALESCE(metadata->'communications_log', '[]'::jsonb) || $1::jsonb
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(stamped), leadId]
    );
  } catch (err) {
    console.error('[logCommunications] Failed:', err.message);
  }
}

/**
 * Append a communication log entry to a lead's metadata.
 * Non-blocking — errors are logged but never thrown.
 */
async function logCommunication(leadId, entry) {
  if (!leadId) return;
  try {
    await db.query(
      `UPDATE leads
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{communications_log}',
         COALESCE(metadata->'communications_log', '[]'::jsonb) || $1::jsonb
       ),
       updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify([{ ...entry, timestamp: new Date().toISOString() }]), leadId]
    );
  } catch (err) {
    console.error('[logCommunication] Failed:', err.message);
  }
}

/**
 * Fetch admin contact (email + phone) for a tenant.
 * Falls back to global config if tenant has no settings.
 */
async function getAdminContact(tenantId) {
  try {
    const result = await db.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
    const settings = result.rows[0]?.settings || {};
    return {
      adminEmail: settings.admin_email || config.adminEmail,
      adminPhone: settings.admin_phone || config.adminPhone,
    };
  } catch {
    return { adminEmail: config.adminEmail, adminPhone: config.adminPhone };
  }
}

/**
 * Format an ISO date string into readable Indian locale string.
 */
function fmtDate(iso) {
  if (!iso) return 'the scheduled time';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'long',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/**
 * Fires when AI call books an appointment.
 * Sends WhatsApp + Email to both admin and lead.
 */
async function sendAppointmentBookedNotifications({ tenantId, lead, appointmentIso }) {
  const { adminEmail, adminPhone } = await getAdminContact(tenantId);
  const leadName    = lead.name    || 'Lead';
  const leadPhone   = lead.phone   || '';
  const leadEmail   = lead.email   || null;
  const dateLabel   = fmtDate(appointmentIso);

  const adminWaBody = `📅 Appointment Booked!\nLead: ${leadName}\nPhone: ${leadPhone}\nDate & Time: ${dateLabel}\n\nBooked automatically via AI call.`;

  const leadWaBody  = `Hi ${leadName}! 🎉 Your appointment has been confirmed for ${dateLabel}. Please keep this time free — our team looks forward to connecting with you!`;

  const adminEmailHtml = `
    <h2>📅 Appointment Booked</h2>
    <p>An appointment was successfully booked via AI call.</p>
    <table cellpadding="6" style="border-collapse:collapse;">
      <tr><td><strong>Lead Name</strong></td><td>${leadName}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${leadPhone}</td></tr>
      <tr><td><strong>Email</strong></td><td>${leadEmail || 'N/A'}</td></tr>
      <tr><td><strong>Appointment</strong></td><td>${dateLabel}</td></tr>
    </table>
    <p style="margin-top:16px;color:#6b7280;font-size:13px;">Log in to your CRM to view or reschedule this appointment.</p>
  `;

  const leadEmailHtml = `
    <h2>Your Appointment is Confirmed! 🎉</h2>
    <p>Hi ${leadName},</p>
    <p>We're pleased to confirm your appointment for <strong>${dateLabel}</strong>.</p>
    <p>Please make sure you're available at that time. We'll send you a reminder closer to the date.</p>
    <br/>
    <p>Looking forward to speaking with you!</p>
  `;

  const tasks = [
    sendWhatsApp({ tenantId, to: adminPhone, body: adminWaBody }),
    sendEmail({ tenantId, to: adminEmail, subject: `📅 Appointment Booked – ${leadName}`, html: adminEmailHtml }),
  ];
  if (leadPhone) tasks.push(sendWhatsApp({ tenantId, to: leadPhone, body: leadWaBody }));
  if (leadEmail) tasks.push(sendEmail({ tenantId, to: leadEmail, subject: 'Your Appointment is Confirmed!', html: leadEmailHtml }));

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[appt-notify] task ${i} failed:`, r.reason?.message || r.reason);
  });

  const logEntries = [
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120), status: results[0].status },
    { type: 'email',    direction: 'to_admin', subject: `Appointment Booked – ${leadName}`, status: results[1].status },
  ];
  if (leadPhone) logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120), status: results[2]?.status || 'skipped' });
  if (leadEmail) logEntries.push({ type: 'email',    direction: 'to_lead', subject: 'Appointment Confirmed', status: results[leadPhone ? 3 : 2]?.status || 'skipped' });

  if (lead.id) logCommunications(lead.id, logEntries).catch(() => {});
}

/**
 * Fires when AI call outcome is 'callback'.
 * Sends WhatsApp ONLY (no email) to both admin and lead.
 */
async function sendCallbackNotifications({ tenantId, lead }) {
  const { adminPhone } = await getAdminContact(tenantId);
  const leadName  = lead.name  || 'Lead';
  const leadPhone = lead.phone || '';

  const adminWaBody = `🔔 Callback Requested!\nLead: ${leadName}\nPhone: ${leadPhone}\n\nThey asked to be called back. Please follow up at your earliest convenience.`;
  const leadWaBody  = `Hi ${leadName}! 👋 We noted that you'd like a callback. Our team will reach out to you shortly. Thank you for your patience!`;

  const tasks = [sendWhatsApp({ tenantId, to: adminPhone, body: adminWaBody })];
  if (leadPhone) tasks.push(sendWhatsApp({ tenantId, to: leadPhone, body: leadWaBody }));

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[callback-notify] task ${i} failed:`, r.reason?.message || r.reason);
  });

  const logEntries = [
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120), status: results[0].status },
  ];
  if (leadPhone) logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120), status: results[1]?.status || 'skipped' });

  if (lead.id) logCommunications(lead.id, logEntries).catch(() => {});
}

/**
 * Send appointment reminder via WhatsApp.
 */
async function sendAppointmentReminder({ tenantId, lead, hoursUntil }) {
  const timeLabel = hoursUntil <= 3 ? '3 hours' : '24 hours';
  const appointmentDate = lead.metadata?.appointment_date
    ? new Date(lead.metadata.appointment_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'your scheduled time';

  const body = `⏰ Reminder: Hi ${lead.name}, your appointment is in ${timeLabel} — at ${appointmentDate}. Please be prepared!`;

  const result = await sendWhatsApp({ tenantId, to: lead.phone, body });
  logCommunication(lead.id, { type: 'whatsapp', direction: 'to_lead', message: body.slice(0, 120), status: 'fulfilled' }).catch(() => {});
  return result;
}

module.exports = {
  sendEmail,
  sendWhatsApp,
  sendLeadEntryNotifications,
  sendAppointmentBookedNotifications,
  sendCallbackNotifications,
  sendAppointmentReminder,
  logCommunication,
  logCommunications,
  getAdminContact,
};
