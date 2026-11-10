/**
 * Outbound email and WhatsApp go through MSG91 only.
 * Resend and AiSensy are not fallbacks.
 * Provider acceptance is recorded as queued, never as delivered.
 */

const config = require('../../config');
const db = require('../../db');
const { buildEmailPayload, postEmail } = require('./msg91Email');
const { buildTemplatePayload, postTemplate } = require('./msg91Whatsapp');
const { channelDecision, normalizeAddress, readConsent } = require('../consent');

function parseMap(raw) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function emailTemplateId(templateKey) {
  const map = parseMap(process.env.MSG91_EMAIL_TEMPLATES);
  return map[templateKey] || null;
}

function whatsAppTemplateName(templateKey) {
  const map = parseMap(process.env.MSG91_WHATSAPP_TEMPLATES);
  return map[templateKey] || null;
}

async function suppressed(tenantId, channel, address) {
  const normalized = normalizeAddress(channel, address);
  if (!tenantId || !normalized) return false;
  try {
    const result = await db.query(
      `SELECT 1 FROM communication_suppressions
       WHERE tenant_id = $1 AND channel = $2 AND address = $3 LIMIT 1`,
      [tenantId, channel, normalized]
    );
    return result.rows.length > 0;
  } catch (err) {
    if (String(err.message || '').includes('communication_suppressions')) return false;
    throw err;
  }
}

async function leadConsent(leadId, tenantId) {
  if (!leadId) return {};
  const result = await db.query(
    `SELECT channel_consent, metadata FROM leads WHERE id = $1 AND tenant_id = $2`,
    [leadId, tenantId]
  );
  return readConsent(result.rows[0]);
}

async function gate({ tenantId, leadId, channel, address, enforceConsent }) {
  const isSuppressed = await suppressed(tenantId, channel, address);
  if (!enforceConsent) {
    if (isSuppressed) return { allowed: false, reason: 'suppressed' };
    return { allowed: true, reason: 'business_notification' };
  }
  const consent = await leadConsent(leadId, tenantId);
  const requireGrant = process.env[`REQUIRE_${channel.toUpperCase()}_CONSENT`] === 'true';
  return channelDecision({ channel, consent, suppressed: isSuppressed, requireGrant });
}

async function recordUsage({ tenantId, provider, meter, quantity, unit, status, idempotencyKey, metadata }) {
  try {
    await db.query(
      `INSERT INTO usage_ledger
         (tenant_id, provider, meter, quantity, unit, status, idempotency_key, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      [tenantId, provider, meter, quantity, unit, status, idempotencyKey, JSON.stringify(metadata || {})]
    );
  } catch (err) {
    console.warn('[usage] ledger write skipped:', err.message);
  }
}

async function sendTransactionalEmail({
  tenantId,
  to,
  toName,
  templateKey,
  variables = {},
  replyTo,
  leadId,
  enforceConsent = false,
  fetchImpl,
}) {
  if (!to) return { skipped: true, reason: 'no recipient', accepted: false, delivered: false };
  const decision = await gate({ tenantId, leadId, channel: 'email', address: to, enforceConsent });
  if (!decision.allowed) return { skipped: true, reason: decision.reason, accepted: false, delivered: false };

  const templateId = emailTemplateId(templateKey);
  if (!config.msg91AuthKey || !templateId || !config.msg91EmailDomain || !config.msg91EmailFrom) {
    return { skipped: true, reason: 'msg91_email_not_configured', accepted: false, delivered: false };
  }

  const crqid = leadId ? `${leadId}:${templateKey}:${Date.now()}` : undefined;
  const payload = buildEmailPayload({
    templateId,
    to,
    toName,
    variables,
    fromEmail: config.msg91EmailFrom,
    fromName: config.msg91EmailFromName,
    domain: config.msg91EmailDomain,
    replyTo: replyTo || config.msg91EmailReplyTo,
    crqid,
  });
  const result = await postEmail({ authKey: config.msg91AuthKey, payload, fetchImpl });
  if (result.accepted) {
    await recordUsage({
      tenantId,
      provider: 'msg91',
      meter: 'email_accepted',
      quantity: 1,
      unit: 'message',
      status: 'accepted',
      idempotencyKey: result.providerRequestId || crqid,
      metadata: { templateKey, delivered: false },
    });
  }
  return { ...result, provider: 'msg91', crqid, templateKey };
}

async function sendTransactionalWhatsApp({
  tenantId,
  to,
  templateKey,
  templateParams = [],
  leadId,
  enforceConsent = false,
  fetchImpl,
}) {
  if (!to) return { skipped: true, reason: 'no recipient', accepted: false, delivered: false };
  const decision = await gate({ tenantId, leadId, channel: 'whatsapp', address: to, enforceConsent });
  if (!decision.allowed) return { skipped: true, reason: decision.reason, accepted: false, delivered: false };

  const templateName = whatsAppTemplateName(templateKey);
  if (!config.msg91AuthKey || !templateName || !config.msg91WhatsappNumber) {
    return { skipped: true, reason: 'msg91_whatsapp_not_configured', accepted: false, delivered: false };
  }

  const payload = buildTemplatePayload({
    integratedNumber: config.msg91WhatsappNumber,
    templateName,
    languageCode: config.msg91WhatsappLanguage || 'en',
    to,
    params: templateParams,
  });
  const result = await postTemplate({ authKey: config.msg91AuthKey, payload, fetchImpl });
  if (result.accepted) {
    await recordUsage({
      tenantId,
      provider: 'msg91',
      meter: 'whatsapp_accepted',
      quantity: 1,
      unit: 'message',
      status: 'accepted',
      idempotencyKey: result.providerRequestId || `${leadId || 'na'}:${templateKey}:${Date.now()}`,
      metadata: { templateKey, delivered: false },
    });
  }
  return { ...result, provider: 'msg91', templateKey };
}

module.exports = {
  sendTransactionalEmail,
  sendTransactionalWhatsApp,
  emailTemplateId,
  whatsAppTemplateName,
};
