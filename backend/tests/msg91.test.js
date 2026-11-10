const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { buildEmailPayload, interpretEmailResponse } = require('../services/comms/msg91Email');
const { buildTemplatePayload, interpretWhatsAppResponse } = require('../services/comms/msg91Whatsapp');
const {
  verifyMetaSignature,
  msg91WebhookAuthorized,
  mapEmailEvent,
  mapWhatsAppEvent,
} = require('../services/comms/webhookAuth');

test('email payload uses the documented template contract and CRQID', () => {
  const payload = buildEmailPayload({
    templateId: 'lead_thanks',
    to: 'lead@example.com',
    toName: 'Asha',
    variables: { name: 'Asha' },
    fromEmail: 'hello@example.com',
    fromName: 'CortexFlow',
    domain: 'example.com',
    crqid: 'comm-1',
  });
  assert.equal(payload.template_id, 'lead_thanks');
  assert.equal(payload.recipients[0].to[0].email, 'lead@example.com');
  assert.equal(payload.recipients[0].to[0].CRQID, 'comm-1');
  assert.equal(payload.domain, 'example.com');
  assert.equal(payload.html, undefined);
});

test('a queued email response is not treated as delivered', () => {
  const result = interpretEmailResponse(200, {
    status: 'success',
    hasError: false,
    data: { unique_id: 'abc' },
    message: 'Thank you. Your request has been queued.',
  });
  assert.equal(result.accepted, true);
  assert.equal(result.delivered, false);
  assert.equal(result.providerRequestId, 'abc');
});

test('whatsapp payload matches the bulk template endpoint', () => {
  const payload = buildTemplatePayload({
    integratedNumber: '+91 99999 00000',
    templateName: 'lead_welcome',
    languageCode: 'en',
    to: '+919876543210',
    params: ['Asha', '2 minutes'],
  });
  assert.equal(payload.content_type, 'template');
  assert.equal(payload.integrated_number, '919999900000');
  assert.equal(payload.payload.template.name, 'lead_welcome');
  assert.equal(payload.payload.template.to_and_components[0].to[0], '919876543210');
  assert.equal(payload.payload.template.to_and_components[0].components.body_1.value, 'Asha');
  assert.equal(payload.payload.template.to_and_components[0].components.body_2.value, '2 minutes');
});

test('whatsapp acceptance is not delivery', () => {
  const result = interpretWhatsAppResponse(200, {
    status: 'success',
    hasError: false,
    data: 'Your request is in process, check delivery reports for status',
    request_id: 'req-1',
  });
  assert.equal(result.accepted, true);
  assert.equal(result.delivered, false);
  assert.equal(result.providerRequestId, 'req-1');
});

test('meta signature rejects a missing or mismatched secret', () => {
  const body = Buffer.from('{"object":"page"}');
  const secret = 'app-secret';
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, good, secret), true);
  assert.equal(verifyMetaSignature(body, good, 'other'), false);
  assert.equal(verifyMetaSignature(body, '', secret), false);
});

test('msg91 webhook requires the configured header and maps delivery events', () => {
  assert.equal(msg91WebhookAuthorized('secret', 'secret'), true);
  assert.equal(msg91WebhookAuthorized('nope', 'secret'), false);
  assert.equal(msg91WebhookAuthorized('secret', ''), false);
  const email = mapEmailEvent({ requestId: 'r1', eventId: '4', eventName: 'Delivered', crqid: 'c1', recipient: 'a@b.com' });
  assert.equal(email.status, 'delivered');
  assert.equal(email.crqid, 'c1');
  const wa = mapWhatsAppEvent({ requestId: 'r2', eventName: 'read', customerNumber: '9198' });
  assert.equal(wa.status, 'read');
});
