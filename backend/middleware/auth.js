/**
 * Auth helpers for the Express API.
 *
 * CRM callers send the Supabase access token as Authorization: Bearer <jwt>.
 * Voice/cron callers send x-voice-secret or Authorization: Bearer <CRON_SECRET>.
 * Production fails closed when secrets are missing.
 */

const config = require('../config');
const db = require('../db');

function isProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return '';
}

async function resolveTenantForUser(userId) {
  const result = await db.query(
    `SELECT tenant_id, role, is_active FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const row = result.rows[0];
  if (row) {
    return {
      tenantId: row.tenant_id || userId,
      role: row.role || 'executive',
      isActive: row.is_active !== false,
    };
  }
  // Legacy owner: tenant id was created as the auth user id.
  // Do not read auth.users.raw_user_meta_data.tenant_id here — that value
  // diverged from user_profiles and caused CRM 403 Tenant mismatch.
  return { tenantId: userId, role: 'admin', isActive: true };
}

/**
 * Require a valid Supabase user JWT. Sets req.userId, req.userEmail, req.tenantId, req.role.
 * If the request names a tenant_id (body/params/query), it must match the session tenant.
 */
async function requireUser(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const supabaseUrl = config.supabaseUrl;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    config.supabaseServiceKey;
  if (!supabaseUrl || !anonKey) {
    return res.status(503).json({ error: 'Auth is not configured' });
  }

  try {
    const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    const user = await resp.json();
    if (!user?.id) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const membership = await resolveTenantForUser(user.id);
    if (!membership.isActive) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    req.userId = user.id;
    req.userEmail = user.email || null;
    req.tenantId = membership.tenantId;
    req.role = membership.role;

    const claimed =
      (typeof req.body?.tenant_id === 'string' && req.body.tenant_id.trim()) ||
      (typeof req.body?.tenantId === 'string' && req.body.tenantId.trim()) ||
      (typeof req.params?.tenantId === 'string' && req.params.tenantId.trim()) ||
      (typeof req.query?.tenantId === 'string' && req.query.tenantId.trim()) ||
      (typeof req.query?.tenant_id === 'string' && req.query.tenant_id.trim()) ||
      null;

    if (claimed && claimed !== req.tenantId) {
      return res.status(403).json({ error: 'Tenant mismatch' });
    }

    return next();
  } catch (err) {
    console.error('[auth] requireUser failed:', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireVoiceSecret(req, res, next) {
  if (!config.voiceSecret) {
    if (isProduction()) {
      return res.status(503).json({ error: 'VOICE_SECRET is not configured' });
    }
    console.warn('[auth] VOICE_SECRET unset — voice routes are open in development');
    return next();
  }
  const secret = req.headers['x-voice-secret'] || '';
  if (secret !== config.voiceSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function requireCronSecret(req, res, next) {
  const expected = config.cronSecret || config.voiceSecret;
  if (!expected) {
    if (isProduction()) {
      return res.status(503).json({ error: 'CRON_SECRET is not configured' });
    }
    return next();
  }
  const auth = bearerToken(req);
  const voice = req.headers['x-voice-secret'] || '';
  if (auth === expected || voice === config.voiceSecret) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

function requireAdminToken(req, res, next) {
  if (!config.adminToken) {
    if (isProduction()) {
      return res.status(503).json({ error: 'ADMIN_TOKEN is not configured' });
    }
    return next();
  }
  const token = req.headers['x-admin-token'] || bearerToken(req);
  if (token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin token' });
  }
  return next();
}

function isPublicPath(path) {
  const publicPrefixes = [
    '/health',
    '/v1/webhook/',
    '/v1/demo/',
    '/v1/calls/result',
    '/v1/calls/tools',
    '/v1/internal/',
    '/v1/email/inbound',
    '/v1/meta/webhook',
    '/v1/meta/callback',
    '/v1/google-calendar/callback',
  ];
  return publicPrefixes.some((p) => path === p || path.startsWith(p));
}

module.exports = {
  isProduction,
  requireUser,
  requireVoiceSecret,
  requireCronSecret,
  requireAdminToken,
  isPublicPath,
};
