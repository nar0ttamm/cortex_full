const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const db = require('../db');
const config = require('../config');
const { normalizeAddress } = require('../services/consent');
const {
  msg91WebhookAuthorized,
  mapEmailEvent,
  mapWhatsAppEvent,
} = require('../services/comms/webhookAuth');

const router = Router();

function eventFor(body) {
  const whatsapp = Boolean(body.customerNumber || body.customer_number || body.integrated_number);
  return whatsapp ? { channel: 'whatsapp', event: mapWhatsAppEvent(body) } : { channel: 'email', event: mapEmailEvent(body) };
}

// POST /v1/msg91/webhook
// Configure this URL in MSG91 Webhook (New) and send header x-msg91-webhook-secret.
// 401 is reserved for a bad secret. Other unrecognized events return 200 so MSG91 does not pause the webhook.
router.post('/msg91/webhook', asyncHandler(async (req, res) => {
  const header = req.headers['x-msg91-webhook-secret'] || req.headers['x-webhook-secret'] || '';
  if (!msg91WebhookAuthorized(header, config.msg91WebhookSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { channel, event } = eventFor(req.body || {});
  if (!event.requestId && !event.crqid) {
    return res.status(200).json({ status: 'ignored', reason: 'no correlation id' });
  }

  const found = await db.query(
    `SELECT id, tenant_id, lead_id, channel, metadata
     FROM communications
     WHERE metadata->>'provider_request_id' = $1
        OR metadata->>'crqid' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [event.requestId || '', event.crqid || '']
  );
  if (!found.rows[0]) return res.status(200).json({ status: 'ignored', reason: 'unknown message' });

  const row = found.rows[0];
  const seen = Array.isArray(row.metadata?.seen_event_keys) ? row.metadata.seen_event_keys : [];
  if (event.eventKey && seen.includes(event.eventKey)) {
    return res.status(200).json({ status: 'duplicate' });
  }

  const nextSeen = event.eventKey ? seen.concat(event.eventKey).slice(-20) : seen;
  await db.query(
    `UPDATE communications
     SET status = $1,
         provider = COALESCE(provider, 'msg91'),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE id = $3 AND tenant_id = $4`,
    [
      event.status,
      JSON.stringify({
        seen_event_keys: nextSeen,
        last_provider_status: event.status,
        last_provider_reason: event.reason,
        provider_request_id: event.requestId || row.metadata?.provider_request_id || null,
        crqid: event.crqid || row.metadata?.crqid || null,
      }),
      row.id,
      row.tenant_id,
    ]
  );

  if (event.status === 'unsubscribed') {
    const address = normalizeAddress(channel, typeof event.recipient === 'string' ? event.recipient : '');
    if (address) {
      await db.query(
        `INSERT INTO communication_suppressions (tenant_id, channel, address, reason)
         VALUES ($1, $2, $3, 'provider_unsubscribe')
         ON CONFLICT (tenant_id, channel, address) DO NOTHING`,
        [row.tenant_id, channel, address]
      ).catch((err) => console.warn('[msg91] suppression skipped:', err.message));
    }
  }

  return res.status(200).json({ status: 'updated' });
}));

module.exports = router;
