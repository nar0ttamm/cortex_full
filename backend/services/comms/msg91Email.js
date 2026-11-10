/**
 * MSG91 transactional email.
 * Official contract: POST https://control.msg91.com/api/v5/email/send
 * Header authkey. Body uses a pre-created template_id.
 * A 200 with status "success" means the request was queued, not delivered.
 * Docs: https://docs.msg91.com/email/send-email.openapi.yml
 * CRQID: https://msg91.com/help/email/how-to-send-the-crqid-via-email-api
 */

function buildEmailPayload({
  templateId,
  to,
  toName,
  variables = {},
  fromEmail,
  fromName,
  domain,
  replyTo,
  crqid,
}) {
  if (!templateId) throw new Error('MSG91 email requires template_id');
  if (!to) throw new Error('MSG91 email requires a recipient');
  if (!domain) throw new Error('MSG91 email requires a verified domain');
  if (!fromEmail) throw new Error('MSG91 email requires a from address');

  const recipient = {
    to: [{ email: to, name: toName || undefined, ...(crqid ? { CRQID: crqid } : {}) }],
    variables,
  };
  const body = {
    template_id: templateId,
    domain,
    from: { email: fromEmail, name: fromName || undefined },
    recipients: [recipient],
  };
  if (replyTo) body.reply_to = [{ email: replyTo }];
  return body;
}

function interpretEmailResponse(status, body) {
  const queued = status >= 200 && status < 300 && body?.hasError !== true && body?.status === 'success';
  return {
    accepted: queued,
    delivered: false,
    providerRequestId: body?.data?.unique_id || null,
    message: body?.message || null,
  };
}

async function postEmail({ authKey, payload, fetchImpl = fetch, baseUrl = 'https://control.msg91.com' }) {
  if (!authKey) return { accepted: false, skipped: true, reason: 'msg91_not_configured' };
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v5/email/send`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: authKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  const interpreted = interpretEmailResponse(response.status, body);
  if (!interpreted.accepted) {
    const reason = body?.message || `HTTP ${response.status}`;
    return { ...interpreted, error: reason };
  }
  return interpreted;
}

module.exports = { buildEmailPayload, interpretEmailResponse, postEmail };
