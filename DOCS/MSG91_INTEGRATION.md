# MSG91 integration

CortexFlow uses one central MSG91 account for transactional email and WhatsApp. Tenants do not receive the auth key. Usage and message history stay on the tenant that sent the message.

Official sources read on 10 November 2026:

- Email send: `POST https://control.msg91.com/api/v5/email/send` with header `authkey`. Body uses `template_id`, `recipients`, `from`, and `domain`. A success body says the request was queued and returns `data.unique_id`. It is not a delivery receipt. https://docs.msg91.com/email/send-email.openapi.yml
- Custom correlation id `CRQID` on the recipient, case-sensitive. https://msg91.com/help/email/how-to-send-the-crqid-via-email-api
- Email delivery webhooks are created in the MSG91 dashboard under Email, Webhook (New). Events include queued, accepted, delivered, opened, and failed (`eventId` 1, 2, 4, 5, 9). The dashboard can attach custom headers. No request signature is documented. https://msg91.com/help/webhook-new/how-to-receive-email-delivery-reports-via-webhook-new
- WhatsApp template send: `POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/` with `integrated_number`, `content_type: template`, and `to_and_components`. Success means the request is in process and returns `request_id`. https://docs.msg91.com/whatsapp/template-bulk.openapi.yml
- Session text is a separate endpoint, `POST /api/v5/whatsapp/whatsapp-outbound-message/` with query parameters. Notifications do not use it. https://docs.msg91.com/whatsapp/send-message-in-text.openapi.yml
- WhatsApp delivery webhooks are also dashboard-configured. Documented outbound statuses include sent, failed, delivered, and read. https://msg91.com/help/webhook-new/how-to-receive-whatsapp-delivery-reports-via-webhook-new

## Decisions

- `backend/services/comms/msg91Email.js` and `msg91Whatsapp.js` build only those documented bodies.
- `backend/services/notificationService.js` no longer calls Resend or AiSensy.
- A missing template id or auth key returns `skipped`. It does not fall back to another provider.
- Provider acceptance is stored as `accepted`. Delivery status changes only when `POST /v1/msg91/webhook` matches `provider_request_id` or `crqid` on a `communications` row.
- The webhook requires header `x-msg91-webhook-secret` equal to `MSG91_WEBHOOK_SECRET`. That header must be configured in the MSG91 dashboard. A bad secret returns 401. An unknown message returns 200 so MSG91 does not auto-pause the webhook.
- Lead-directed sends check channel consent and `communication_suppressions`. An email grant does not allow WhatsApp.
- Template ids and the WhatsApp integrated number come from environment variables, not from code.

## Not confirmed

- Whether the purchased MSG91 plan includes the email and WhatsApp APIs, webhooks, and the templates named in `MSG91_EMAIL_TEMPLATES` and `MSG91_WHATSAPP_TEMPLATES`.
- Inbound email replies. MSG91 email webhooks above are delivery reports, not mailbox replies. `POST /v1/email/inbound` remains a separate secret-protected endpoint.
- A cryptographic webhook signature. None is documented, so the shared header is the check.
- Live delivery. No message was sent to a real recipient from this work.

## Operator setup

1. Verify the sending domain in MSG91 and create one template per logical key.
2. Set the backend environment variables in `backend/env.template`.
3. Point MSG91 Webhook (New) at `https://<backend>/v1/msg91/webhook` and add header `x-msg91-webhook-secret`.
4. Send one message to an approved test recipient and confirm the communications row moves from `accepted` to `delivered` or `failed`.
