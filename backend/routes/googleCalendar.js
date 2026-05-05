/**
 * Google Calendar OAuth + Sync (Phase 6)
 *
 * GET  /v1/google-calendar/auth?tenantId=   — Get OAuth URL
 * GET  /v1/google-calendar/callback          — Handle OAuth callback
 * GET  /v1/google-calendar/status?tenantId= — Check connection status
 * POST /v1/google-calendar/create-event     — Create event for an appointment
 * DELETE /v1/google-calendar/disconnect?tenantId= — Disconnect
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (e.g. https://cortex-backend-api.vercel.app/v1/google-calendar/callback)
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');

const router = Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

function getGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Google token');
  return res.json();
}

async function getValidToken(tenantId) {
  const result = await db.query(
    `SELECT * FROM google_calendar_tokens WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!result.rows.length) return null;

  const token = result.rows[0];
  const expiresAt = new Date(token.token_expiry).getTime();

  if (expiresAt - Date.now() < 5 * 60 * 1000 && token.refresh_token) {
    // Refresh token
    const refreshed = await refreshAccessToken(token.refresh_token);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await db.query(
      `UPDATE google_calendar_tokens SET access_token = $1, token_expiry = $2, updated_at = now() WHERE tenant_id = $3`,
      [refreshed.access_token, newExpiry, tenantId]
    );
    return { ...token, access_token: refreshed.access_token };
  }

  return token;
}

// GET /v1/google-calendar/auth
router.get('/google-calendar/auth', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  if (!config.googleClientId || !config.googleRedirectUri) {
    return res.status(503).json({ error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.' });
  }

  const state = Buffer.from(JSON.stringify({ tenantId })).toString('base64url');
  const url = getGoogleAuthUrl(state);
  return res.json({ url });
}));

// GET /v1/google-calendar/callback
router.get('/google-calendar/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${config.backendUrl.replace('/api', '')}/integrations?error=google_calendar_denied`);
  }

  let tenantId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    tenantId = decoded.tenantId;
  } catch {
    return res.status(400).send('Invalid state parameter');
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      redirect_uri: config.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    console.error('[google-calendar] token exchange error:', err);
    return res.redirect('/integrations?error=google_calendar_token_failed');
  }

  const tokens = await tokenRes.json();
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await db.query(
    `INSERT INTO google_calendar_tokens (tenant_id, access_token, refresh_token, token_expiry, sync_enabled, calendar_id)
     VALUES ($1, $2, $3, $4, true, 'primary')
     ON CONFLICT (tenant_id) DO UPDATE SET
       access_token = $2, refresh_token = COALESCE($3, google_calendar_tokens.refresh_token),
       token_expiry = $4, sync_enabled = true, updated_at = now()`,
    [tenantId, tokens.access_token, tokens.refresh_token || null, expiry]
  );

  // Log activity
  await db.query(
    `INSERT INTO activity_logs (tenant_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, 'integration_connected', 'google_calendar', $1, '{"integration":"google_calendar"}')`,
    [tenantId]
  ).catch(() => {});

  const crmUrl = process.env.CRM_URL || 'https://crm.cortexflow.in';
  return res.redirect(`${crmUrl}/integrations?success=google_calendar_connected`);
}));

// GET /v1/google-calendar/status
router.get('/google-calendar/status', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `SELECT sync_enabled, calendar_id, token_expiry, created_at FROM google_calendar_tokens WHERE tenant_id = $1`,
    [tenantId]
  );

  if (!result.rows.length) {
    return res.json({ connected: false });
  }

  return res.json({ connected: true, ...result.rows[0] });
}));

// POST /v1/google-calendar/create-event
router.post('/google-calendar/create-event', asyncHandler(async (req, res) => {
  const { tenantId, appointmentId, title, description, startTime, endTime, attendeeEmail, attendeeName } = req.body;

  if (!tenantId || !startTime) {
    return res.status(400).json({ error: 'tenantId and startTime are required' });
  }

  const tokenData = await getValidToken(tenantId);
  if (!tokenData) {
    return res.status(404).json({ error: 'Google Calendar not connected for this tenant' });
  }

  if (!tokenData.sync_enabled) {
    return res.json({ skipped: true, reason: 'Sync disabled' });
  }

  const calendarId = tokenData.calendar_id || 'primary';
  const endIso = endTime || new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

  const event = {
    summary: title || 'CortexFlow Appointment',
    description: description || 'Appointment booked via CortexFlow AI call',
    start: { dateTime: startTime, timeZone: 'Asia/Kolkata' },
    end: { dateTime: endIso, timeZone: 'Asia/Kolkata' },
    attendees: attendeeEmail ? [{ email: attendeeEmail, displayName: attendeeName }] : [],
    conferenceData: {
      createRequest: { requestId: `cortexflow-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
  };

  const createRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(`Google Calendar API error: ${err.error?.message || createRes.status}`);
  }

  const created = await createRes.json();

  // Update appointment with google_event_id and meet link
  if (appointmentId) {
    await db.query(
      `UPDATE appointments SET google_event_id = $1, google_meet_link = $2 WHERE id = $3`,
      [created.id, created.hangoutLink || null, appointmentId]
    ).catch(() => {});
  }

  return res.json({
    success: true,
    eventId: created.id,
    eventLink: created.htmlLink,
    meetLink: created.hangoutLink || null,
  });
}));

// DELETE /v1/google-calendar/disconnect
router.delete('/google-calendar/disconnect', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  await db.query(`DELETE FROM google_calendar_tokens WHERE tenant_id = $1`, [tenantId]);

  await db.query(
    `INSERT INTO activity_logs (tenant_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, 'integration_disconnected', 'google_calendar', $1, '{"integration":"google_calendar"}')`,
    [tenantId]
  ).catch(() => {});

  return res.json({ success: true });
}));

module.exports = router;
