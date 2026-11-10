/**
 * POST /v1/email/inbound
 *
 * Inbound email replies. Requires INBOUND_WEBHOOK_SECRET in the x-inbound-secret header.
 * The response never includes the matched lead. Ambiguous matches across tenants are ignored.
 */

const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const { logCommunication } = require('../services/notificationService');

const router = Router();

// GET /v1/email/inbound — Resend health check ping during webhook registration
router.get('/email/inbound', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'cortexflow-email-inbound' });
});

// POST /v1/email/inbound
router.post('/email/inbound', asyncHandler(async (req, res) => {
  const { timingSafeEqualText } = require('../services/comms/webhookAuth');
  const provided = req.headers['x-inbound-secret'] || '';
  if (!config.inboundWebhookSecret || !timingSafeEqualText(provided, config.inboundWebhookSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body || {};
  const data = payload.data || payload;
  const rawFrom = data.from || data.From || '';
  const subject = data.subject || data.Subject || '(no subject)';
  const textBody = data.text || data.Text || '';
  const fromEmail = extractEmail(rawFrom);
  const fromName = extractName(rawFrom);

  if (!fromEmail) {
    return res.status(200).json({ status: 'ignored', reason: 'no from address' });
  }

  const leadResult = await db.query(
    `SELECT id, tenant_id, name FROM leads
     WHERE lower(email) = $1
     ORDER BY created_at DESC
     LIMIT 2`,
    [fromEmail]
  );

  if (leadResult.rows.length !== 1) {
    return res.status(200).json({ status: 'ignored', reason: leadResult.rows.length === 0 ? 'not found' : 'ambiguous' });
  }

  const lead = leadResult.rows[0];
  const preview = stripQuotedText(textBody).slice(0, 500);
  await logCommunication(lead.id, {
    type: 'email',
    direction: 'from_lead',
    subject,
    message: preview || textBody.slice(0, 500),
    from: fromEmail,
    from_name: fromName || lead.name,
  });

  return res.status(200).json({ status: 'logged' });
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEmail(raw) {
  if (!raw) return '';
  // Match <email@example.com> format
  const match = raw.match(/<([^>]+@[^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  // Plain email
  if (raw.includes('@')) return raw.trim().toLowerCase();
  return '';
}

function extractName(raw) {
  if (!raw) return '';
  const match = raw.match(/^([^<]+)<[^>]+>/);
  if (match) return match[1].trim().replace(/"/g, '');
  return '';
}

/**
 * Strips quoted reply text (lines starting with ">") from email body.
 * Keeps only the new content the lead wrote.
 */
function stripQuotedText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const newLines = [];
  for (const line of lines) {
    // Stop at common reply separators
    if (/^>/.test(line)) continue;
    if (/^On .* wrote:/.test(line)) break;
    if (/^-{3,}/.test(line)) break;
    if (/^From:/.test(line)) break;
    newLines.push(line);
  }
  return newLines.join('\n').trim();
}

module.exports = router;
