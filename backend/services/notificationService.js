const db = require('../db');
const config = require('../config');
const { sendTransactionalEmail, sendTransactionalWhatsApp } = require('./comms/dispatcher');

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
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stampProvider(entries, results) {
  return entries.map((entry, index) => {
    const value = results[index]?.value || {};
    return {
      ...entry,
      provider: value.provider || null,
      provider_request_id: value.providerRequestId || null,
      crqid: value.crqid || null,
    };
  });
}

function notifyStatus(result) {
  if (!result) return 'skipped';
  if (result.status === 'rejected') return 'failed';
  if (result.value?.skipped) return 'skipped';
  if (result.value?.accepted) return 'accepted';
  return 'failed';
}

async function sendEmail({ tenantId, to, toName, templateKey, variables, leadId, enforceConsent = false }) {
  return sendTransactionalEmail({
    tenantId,
    to,
    toName,
    templateKey,
    variables,
    leadId,
    enforceConsent,
  });
}

async function sendWhatsApp({ tenantId, to, campaignKey, templateParams = [], leadId, enforceConsent = false }) {
  return sendTransactionalWhatsApp({
    tenantId,
    to,
    templateKey: campaignKey,
    templateParams,
    leadId,
    enforceConsent,
  });
}

/**
 * Fire all 4 lead-entry notifications in parallel.
 * Failures are logged but do NOT throw — lead save is never blocked by notification errors.
 */
async function sendLeadEntryNotifications({ tenantId, lead, adminEmail, adminPhone }) {
  const leadName = escapeHtml(lead.name || 'New Lead');
  const leadPhone = escapeHtml(lead.phone || '');
  const leadEmail = lead.email || null;
  const leadInquiry = escapeHtml(lead.inquiry || 'No details provided');
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
    sendEmail({
      tenantId,
      to: adminEmail,
      toName: 'Admin',
      templateKey: 'lead_admin',
      variables: {
        name: lead.name || 'New Lead',
        phone: lead.phone || '',
        email: lead.email || '',
        inquiry: lead.inquiry || '',
        source: lead.source || '',
      },
    }),
    sendWhatsApp({
      tenantId,
      to: adminPhone,
      campaignKey: 'admin_new_lead',
      templateParams: [lead.name || 'New Lead', lead.phone || '', lead.inquiry || '', delayPhrase],
    }),
  ];

  if (leadEmail) {
    tasks.push(sendEmail({
      tenantId,
      to: leadEmail,
      toName: lead.name,
      templateKey: 'lead_thanks',
      variables: { name: lead.name || 'there', delay: delayPhrase },
      leadId: lead.id,
      enforceConsent: true,
    }));
  }

  if (leadPhone) {
    tasks.push(sendWhatsApp({
      tenantId,
      to: leadPhone,
      campaignKey: 'lead_welcome',
      templateParams: [lead.name || 'there', delayPhrase],
      leadId: lead.id,
      enforceConsent: true,
    }));
  }

  const results = await Promise.allSettled(tasks);

  // Log all sends (success or fail) to lead metadata for the Communications page
  const logEntries = [
    { type: 'email',    direction: 'to_admin', subject: `New Lead: ${leadName}`,         status: notifyStatus(results[0]) },
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120),        status: notifyStatus(results[1]) },
  ];
  if (leadEmail)  logEntries.push({ type: 'email',    direction: 'to_lead', subject: 'Thank you for your inquiry!', status: notifyStatus(results[2]) });
  if (leadPhone)  logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120),      status: notifyStatus(results[leadEmail ? 3 : 2]) });

  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[notifications] task ${i} failed:`, r.reason?.message || r.reason);
    }
  });

  // Persist all entries in a single atomic write to avoid race conditions
  if (lead.id) {
    logCommunications(lead.id, stampProvider(logEntries, results)).catch(() => {});
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

  // Mirror into the normalized communications table (queryable source of truth).
  // tenant_id is derived from the lead so callers don't need to pass it.
  try {
    await db.query(
      `INSERT INTO communications (tenant_id, lead_id, channel, direction, subject, message, status, provider, metadata, created_at)
       SELECT l.tenant_id, l.id,
              COALESCE(e->>'type', 'unknown'),
              COALESCE(e->>'direction', 'unknown'),
              e->>'subject', e->>'message', e->>'status',
              NULLIF(e->>'provider', ''),
              jsonb_strip_nulls(jsonb_build_object(
                'provider_request_id', e->>'provider_request_id',
                'crqid', e->>'crqid'
              )),
              COALESCE((e->>'timestamp')::timestamptz, now())
       FROM leads l
       CROSS JOIN LATERAL jsonb_array_elements($1::jsonb) e
       WHERE l.id = $2`,
      [JSON.stringify(stamped), leadId]
    );
  } catch (err) {
    console.error('[logCommunications] communications mirror failed:', err.message);
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

  // Mirror into the normalized communications table.
  try {
    await db.query(
      `INSERT INTO communications (tenant_id, lead_id, channel, direction, subject, message, status, created_at)
       SELECT l.tenant_id, l.id,
              COALESCE($1::text, 'unknown'),
              COALESCE($2::text, 'unknown'),
              $3, $4, $5, now()
       FROM leads l
       WHERE l.id = $6`,
      [entry.type, entry.direction, entry.subject || null, entry.message || null, entry.status || null, leadId]
    );
  } catch (err) {
    console.error('[logCommunication] communications mirror failed:', err.message);
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
      adminEmail: settings.contact_email || settings.admin_email || config.adminEmail,
      adminPhone: settings.whatsapp_number || settings.admin_phone || config.adminPhone,
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
  const leadName    = escapeHtml(lead.name    || 'Lead');
  const leadPhone   = escapeHtml(lead.phone   || '');
  const leadEmail   = lead.email   || null;
  const dateLabel   = escapeHtml(fmtDate(appointmentIso));

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
    sendWhatsApp({ tenantId, to: adminPhone, campaignKey: 'appt_booked_admin', templateParams: [lead.name || 'Lead', lead.phone || '', dateLabel] }),
    sendEmail({
      tenantId,
      to: adminEmail,
      toName: 'Admin',
      templateKey: 'appt_booked_admin',
      variables: { name: lead.name || 'Lead', phone: lead.phone || '', email: lead.email || '', when: dateLabel },
    }),
  ];
  if (leadPhone) {
    tasks.push(sendWhatsApp({
      tenantId, to: leadPhone, campaignKey: 'appt_booked_lead', templateParams: [lead.name || 'there', dateLabel],
      leadId: lead.id, enforceConsent: true,
    }));
  }
  if (leadEmail) {
    tasks.push(sendEmail({
      tenantId, to: leadEmail, toName: lead.name, templateKey: 'appt_booked_lead',
      variables: { name: lead.name || 'there', when: dateLabel },
      leadId: lead.id, enforceConsent: true,
    }));
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[appt-notify] task ${i} failed:`, r.reason?.message || r.reason);
  });

  const logEntries = [
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120), status: notifyStatus(results[0]) },
    { type: 'email',    direction: 'to_admin', subject: `Appointment Booked – ${leadName}`, status: notifyStatus(results[1]) },
  ];
  if (leadPhone) logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120), status: notifyStatus(results[2]) });
  if (leadEmail) logEntries.push({ type: 'email',    direction: 'to_lead', subject: 'Appointment Confirmed', status: notifyStatus(results[leadPhone ? 3 : 2]) });

  if (lead.id) logCommunications(lead.id, stampProvider(logEntries, results)).catch(() => {});
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

  const tasks = [sendWhatsApp({ tenantId, to: adminPhone, campaignKey: 'callback_admin', templateParams: [lead.name || 'Lead', lead.phone || ''] })];
  if (leadPhone) {
    tasks.push(sendWhatsApp({
      tenantId, to: leadPhone, campaignKey: 'callback_lead', templateParams: [lead.name || 'there'],
      leadId: lead.id, enforceConsent: true,
    }));
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.error(`[callback-notify] task ${i} failed:`, r.reason?.message || r.reason);
  });

  const logEntries = [
    { type: 'whatsapp', direction: 'to_admin', message: adminWaBody.slice(0, 120), status: notifyStatus(results[0]) },
  ];
  if (leadPhone) logEntries.push({ type: 'whatsapp', direction: 'to_lead', message: leadWaBody.slice(0, 120), status: notifyStatus(results[1]) });

  if (lead.id) logCommunications(lead.id, stampProvider(logEntries, results)).catch(() => {});
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

  const result = await sendWhatsApp({
    tenantId,
    to: lead.phone,
    campaignKey: 'appointment_reminder',
    templateParams: [lead.name, timeLabel, appointmentDate],
    leadId: lead.id,
    enforceConsent: true,
  });
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
