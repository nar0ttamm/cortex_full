const crypto = require('crypto');

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * MSG91 Webhook (New) has no published signature scheme.
 * Authenticity is the custom header configured in the MSG91 dashboard.
 * https://msg91.com/help/webhook-new/how-to-receive-email-delivery-reports-via-webhook-new
 */
function msg91WebhookAuthorized(headerValue, expectedSecret) {
  if (!expectedSecret) return false;
  return timingSafeEqualText(headerValue, expectedSecret);
}

function verifyMetaSignature(rawBody, headerValue, appSecret) {
  if (!appSecret || !rawBody || !headerValue) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return timingSafeEqualText(headerValue, expected);
}

const EMAIL_EVENT_STATUS = {
  1: 'queued',
  2: 'accepted',
  4: 'delivered',
  5: 'opened',
  9: 'failed',
};

function mapEmailEvent(payload = {}) {
  const eventId = String(payload.eventId ?? payload.event_id ?? '');
  const name = String(payload.eventName || payload.event_name || '').toLowerCase();
  let status = EMAIL_EVENT_STATUS[Number(eventId)] || null;
  if (!status) {
    if (name.includes('deliver')) status = 'delivered';
    else if (name.includes('fail') || name.includes('bounce')) status = 'failed';
    else if (name.includes('open')) status = 'opened';
    else if (name.includes('unsub')) status = 'unsubscribed';
    else if (name.includes('queue') || name.includes('accept')) status = 'accepted';
    else status = 'unknown';
  }
  if (name.includes('unsub')) status = 'unsubscribed';
  return {
    status,
    requestId: payload.requestId || payload.request_id || payload.uuid || null,
    crqid: payload.crqid || payload.CRQID || null,
    recipient: payload.recipient || payload.sendTo || null,
    eventKey: [payload.requestId || payload.uuid || '', eventId, name, payload.statusUpdatedAt || payload.ts || ''].join(':'),
    reason: payload.reason || null,
  };
}

function mapWhatsAppEvent(payload = {}) {
  const name = String(payload.eventName || payload.status || '').toLowerCase();
  let status = 'unknown';
  if (name.includes('read')) status = 'read';
  else if (name.includes('deliver')) status = 'delivered';
  else if (name.includes('fail')) status = 'failed';
  else if (name.includes('sent') || name.includes('submit')) status = 'sent';
  return {
    status,
    requestId: payload.requestId || payload.request_id || null,
    crqid: payload.crqid || null,
    recipient: payload.customerNumber || payload.customer_number || null,
    eventKey: [payload.requestId || payload.request_id || '', payload.uuid || '', name, payload.ts || ''].join(':'),
    reason: payload.reason || payload.failureReason || null,
  };
}

module.exports = {
  timingSafeEqualText,
  msg91WebhookAuthorized,
  verifyMetaSignature,
  mapEmailEvent,
  mapWhatsAppEvent,
};
