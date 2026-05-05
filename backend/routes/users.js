/**
 * User management routes (Phase 5 — Team + Role System)
 *
 * Admin can create manager/executive users with email + password.
 * Uses Supabase Admin API via direct DB or service key.
 *
 * POST /v1/users/create       — Admin creates new user (email + password)
 * GET  /v1/users?tenantId=... — List all users in tenant
 * PATCH /v1/users/:id         — Update role / active status
 * GET  /v1/users/me?tenantId= — Get current user's profile + role
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// GET /v1/users?tenantId=...
router.get('/users', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `SELECT up.*, au.email,
            t.name as team_name, tm.team_id
     FROM user_profiles up
     JOIN auth.users au ON au.id = up.user_id
     LEFT JOIN team_members tm ON tm.user_profile_id = up.id
     LEFT JOIN teams t ON t.id = tm.team_id
     WHERE up.tenant_id = $1
     ORDER BY up.created_at ASC`,
    [tenantId]
  );

  return res.json({ users: result.rows });
}));

// GET /v1/users/me?tenantId=&userId=
router.get('/users/me', asyncHandler(async (req, res) => {
  const { tenantId, userId } = req.query;
  if (!tenantId || !userId) return res.status(400).json({ error: 'tenantId and userId required' });

  const result = await db.query(
    `SELECT up.*, au.email,
            t.name as team_name, tm.team_id, t.id as team_id_val
     FROM user_profiles up
     JOIN auth.users au ON au.id = up.user_id
     LEFT JOIN team_members tm ON tm.user_profile_id = up.id
     LEFT JOIN teams t ON t.id = tm.team_id
     WHERE up.user_id = $1 AND up.tenant_id = $2
     LIMIT 1`,
    [userId, tenantId]
  );

  if (!result.rows.length) {
    return res.json({ profile: null, role: 'admin' }); // Default to admin for existing users
  }

  return res.json({ profile: result.rows[0], role: result.rows[0].role });
}));

// POST /v1/users/create
// Admin creates a new user with email + password
// Uses Supabase Admin REST API
router.post('/users/create', asyncHandler(async (req, res) => {
  const {
    tenantId, adminUserId,
    email, password, fullName, phone, role = 'executive', position,
    teamId,
  } = req.body;

  if (!tenantId || !email || !password || !fullName) {
    return res.status(400).json({ error: 'tenantId, email, password, fullName are required' });
  }

  if (!['manager', 'executive'].includes(role)) {
    return res.status(400).json({ error: 'Role must be manager or executive' });
  }

  // Use Supabase Admin API to create the auth user
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return res.status(503).json({ error: 'Supabase admin credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  // Create Supabase auth user via Admin API
  const createUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        tenant_id: tenantId,
        role,
      },
    }),
  });

  if (!createUserRes.ok) {
    const err = await createUserRes.json().catch(() => ({}));
    return res.status(400).json({ error: err.message || 'Failed to create auth user' });
  }

  const { id: newUserId } = await createUserRes.json();

  // Create user_profile
  const profileResult = await db.query(
    `INSERT INTO user_profiles (user_id, tenant_id, full_name, phone, role, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET role = $5, full_name = $3
     RETURNING *`,
    [newUserId, tenantId, fullName, phone || null, role, position || null]
  );

  const userProfile = profileResult.rows[0];

  // Assign to team if teamId provided
  if (teamId) {
    await db.query(
      `INSERT INTO team_members (team_id, user_profile_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_profile_id) DO UPDATE SET role = $3`,
      [teamId, userProfile.id, role]
    );
  }

  // Log activity
  await db.query(
    `INSERT INTO activity_logs (tenant_id, user_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'user_created', 'user', $3, $4)`,
    [tenantId, adminUserId || null, newUserId, JSON.stringify({ email, role, full_name: fullName })]
  ).catch(() => {});

  return res.json({ success: true, user: { id: newUserId, email, role, profile: userProfile } });
}));

// PATCH /v1/users/:userId
router.patch('/users/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { tenantId, role, isActive, fullName, phone, position } = req.body;

  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `UPDATE user_profiles
     SET role = COALESCE($1, role),
         is_active = COALESCE($2, is_active),
         full_name = COALESCE($3, full_name),
         phone = COALESCE($4, phone),
         position = COALESCE($5, position),
         updated_at = now()
     WHERE user_id = $6 AND tenant_id = $7
     RETURNING *`,
    [role, isActive, fullName, phone, position, userId, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: result.rows[0] });
}));

module.exports = router;
