/**
 * POST /v1/email/inbound
 *
 * Receives inbound email webhooks from Resend.
 * Resend sends this when a lead replies to an email you sent them.
 *
 * Set this URL in Resend dashboard → Domains → Inbound → Webhook URL:
 *   https://cortex-backend-api.vercel.app/v1/email/inbound
 *
 * Resend inbound payload shape:
 * {
 *   "type": "email.received",
 *   "data": {
 *     "from": "John Doe <john@example.com>",  or just "john@example.com"
 *     "to": ["reply@yourdomain.com"],
 *     "subject": "Re: Your inquiry",
 *     "text": "plain text reply...",
 *     "html": "<p>html reply</p>",
 *     "headers": [...],
 *     "attachments": []
 *   }
 * }
 */

const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const { logCommunication } = require('../services/notificationService');

const router = Router();

// GET /v1/email/inbound — Resend health check ping during webhook registration
router.get('/email/inbound', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'cortexflow-email-inbound' });
});

// POST /v1/email/inbound
router.post('/email/inbound', asyncHandler(async (req, res) => {
  const payload = req.body || {};

  // Resend wraps in { type, data } — handle both wrapped and flat formats
  const data = payload.data || payload;

  const rawFrom  = data.from    || data.From    || '';
  const subject  = data.subject || data.Subject || '(no subject)';
  const textBody = data.text    || data.Text    || '';
  const htmlBody = data.html    || data.Html    || '';

  // Extract plain email from "Name <email@example.com>" format
  const fromEmail = extractEmail(rawFrom);
  const fromName  = extractName(rawFrom);

  if (!fromEmail) {
    console.warn('[email/inbound] No sender email found in payload');
    return res.status(200).json({ status: 'ignored', reason: 'no from address' });
  }

  // Find lead by their email address
  const leadResult = await db.query(
    'SELECT id, tenant_id, name FROM leads WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [fromEmail.toLowerCase()]
  );

  if (leadResult.rows.length === 0) {
    console.warn('[email/inbound] No lead found for email:', fromEmail);
    // Still return 200 so Resend doesn't retry
    return res.status(200).json({ status: 'ignored', reason: 'lead not found', from: fromEmail });
  }

  const lead = leadResult.rows[0];

  // Strip quoted reply text to get just the new reply (optional — keep full text for now)
  const preview = stripQuotedText(textBody).slice(0, 500);

  // Log the inbound email to lead's communications_log
  await logCommunication(lead.id, {
    type: 'email',
    direction: 'from_lead',
    subject,
    message: preview || textBody.slice(0, 500),
    from: fromEmail,
    from_name: fromName || lead.name,
  });

  console.log(`[email/inbound] Logged reply from ${fromEmail} → lead ${lead.id} (${lead.name})`);

  return res.status(200).json({
    status: 'logged',
    lead_id: lead.id,
    lead_name: lead.name,
    from: fromEmail,
    subject,
  });
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
