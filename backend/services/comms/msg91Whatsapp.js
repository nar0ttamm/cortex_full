/**
 * MSG91 WhatsApp template send.
 * Official contract: POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/
 * A success response says the request is in process. Delivery is a later webhook.
 * Docs: https://docs.msg91.com/whatsapp/template-bulk.openapi.yml
 *
 * Session text is a different endpoint and is not used for notifications.
 * https://docs.msg91.com/whatsapp/send-message-in-text.openapi.yml
 */

function componentsFromParams(params = []) {
  const components = {};
  params.forEach((value, index) => {
    components[`body_${index + 1}`] = { type: 'text', value: String(value ?? '') };
  });
  return components;
}

function buildTemplatePayload({ integratedNumber, templateName, languageCode = 'en', to, params = [] }) {
  if (!integratedNumber) throw new Error('MSG91 WhatsApp requires integrated_number');
  if (!templateName) throw new Error('MSG91 WhatsApp requires a template name');
  if (!to) throw new Error('MSG91 WhatsApp requires a recipient');
  const digits = String(to).replace(/[^\d]/g, '');
  return {
    integrated_number: String(integratedNumber).replace(/[^\d]/g, ''),
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode, policy: 'deterministic' },
        to_and_components: [
          {
            to: [digits],
            components: componentsFromParams(params),
          },
        ],
      },
    },
  };
}

function interpretWhatsAppResponse(status, body) {
  const accepted = status >= 200 && status < 300 && body?.hasError !== true && body?.status === 'success';
  return {
    accepted,
    delivered: false,
    providerRequestId: body?.request_id || null,
    message: typeof body?.data === 'string' ? body.data : body?.message || null,
  };
}

async function postTemplate({ authKey, payload, fetchImpl = fetch, baseUrl = 'https://control.msg91.com' }) {
  if (!authKey) return { accepted: false, skipped: true, reason: 'msg91_not_configured' };
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authkey: authKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  const interpreted = interpretWhatsAppResponse(response.status, body);
  if (!interpreted.accepted) {
    return { ...interpreted, error: body?.errors || body?.message || `HTTP ${response.status}` };
  }
  return interpreted;
}

module.exports = {
  componentsFromParams,
  buildTemplatePayload,
  interpretWhatsAppResponse,
  postTemplate,
};
