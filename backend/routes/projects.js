/**
 * Projects routes — Phase 3/4 V2
 *
 * GET  /v1/projects?tenantId=...
 * POST /v1/projects
 * GET  /v1/projects/:id
 * PATCH /v1/projects/:id
 * GET  /v1/teams?tenantId=...
 * POST /v1/teams
 * GET  /v1/teams/:id/members
 * POST /v1/teams/:id/members
 * DELETE /v1/teams/:id/members/:userId
 */
const { Router } = require('express');
const db = require('../db');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// ─── Projects ────────────────────────────────────────────────────────────────

// GET /v1/projects?tenantId=...
router.get('/projects', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `SELECT p.*, t.name as team_name,
            COUNT(DISTINCT l.id) as lead_count
     FROM projects p
     LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN leads l ON l.project_id = p.id
     WHERE p.tenant_id = $1
     GROUP BY p.id, t.name
     ORDER BY p.created_at DESC`,
    [tenantId]
  );

  return res.json({ projects: result.rows });
}));

// POST /v1/projects
router.post('/projects', asyncHandler(async (req, res) => {
  const {
    tenantId, name, description, leadSource,
    products = [], teamId, newTeamName,
  } = req.body;

  if (!tenantId || !name) {
    return res.status(400).json({ error: 'tenantId and name are required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let resolvedTeamId = teamId || null;
    if (newTeamName && newTeamName.trim() && !teamId) {
      const creator = req.userId
        ? await client.query(
            `SELECT id FROM user_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
            [req.userId, tenantId]
          )
        : { rows: [] };
      const creatorProfileId = creator.rows[0]?.id || null;
      const teamResult = await client.query(
        `INSERT INTO teams (tenant_id, name, manager_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, newTeamName.trim(), creatorProfileId]
      );
      resolvedTeamId = teamResult.rows[0].id;
      if (creatorProfileId) {
        await client.query(
          `INSERT INTO team_members (team_id, user_profile_id, role)
           VALUES ($1, $2, 'manager')
           ON CONFLICT (team_id, user_profile_id) DO NOTHING`,
          [resolvedTeamId, creatorProfileId]
        );
      }
    } else if (resolvedTeamId) {
      const owned = await client.query(
        `SELECT id FROM teams WHERE id = $1 AND tenant_id = $2`,
        [resolvedTeamId, tenantId]
      );
      if (!owned.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'That team is not in this workspace' });
      }
    }

    const creatorProfile = req.userId
      ? await client.query(
          `SELECT id FROM user_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.userId, tenantId]
        )
      : { rows: [] };

    const projectResult = await client.query(
      `INSERT INTO projects (tenant_id, team_id, created_by, name, description, lead_source, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [
        tenantId,
        resolvedTeamId,
        creatorProfile.rows[0]?.id || null,
        name.trim(),
        description?.trim() || null,
        leadSource || null,
      ]
    );
    const project = projectResult.rows[0];

    // Create KB products
    if (products.length > 0) {
      const validProducts = products.filter(p => p.name?.trim());
      for (const p of validProducts) {
        await client.query(
          `INSERT INTO kb_products (project_id, tenant_id, name, property_type, location, price_range, size, possession_status, amenities)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            project.id, tenantId,
            p.name.trim(),
            p.property_type || null,
            p.location || null,
            p.price_range || null,
            p.size || null,
            p.possession_status || null,
            p.amenities || null,
          ]
        );
      }
    }

    // Log activity
    await client.query(
      `INSERT INTO activity_logs (tenant_id, project_id, action_type, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'project_created', 'project', $3, $4)`,
      [tenantId, project.id, project.id, JSON.stringify({ name, products_count: products.length })]
    );

    await client.query('COMMIT');
    return res.json({ success: true, project });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// GET /v1/projects/:id
router.get('/projects/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.query;

  const result = await db.query(
    `SELECT p.*, t.name as team_name
     FROM projects p
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [id, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });

  // Fetch KB products
  const products = await db.query(
    `SELECT * FROM kb_products WHERE project_id = $1 AND is_active = true ORDER BY created_at ASC`,
    [id]
  );

  return res.json({ project: result.rows[0], products: products.rows });
}));

// PATCH /v1/projects/:id
router.patch('/projects/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId, name, description, status, teamId } = req.body;

  const result = await db.query(
    `UPDATE projects
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         team_id = COALESCE($4, team_id),
         updated_at = now()
     WHERE id = $5 AND tenant_id = $6
     RETURNING *`,
    [name, description, status, teamId, id, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
  return res.json({ project: result.rows[0] });
}));

// ─── Teams ───────────────────────────────────────────────────────────────────

// GET /v1/teams?tenantId=...
router.get('/teams', asyncHandler(async (req, res) => {
  const { tenantId } = req.query;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const result = await db.query(
    `SELECT t.*,
            up.full_name as manager_name,
            COUNT(DISTINCT tm.id) as member_count,
            COUNT(DISTINCT p.id) as project_count
     FROM teams t
     LEFT JOIN user_profiles up ON up.id = t.manager_id
     LEFT JOIN team_members tm ON tm.team_id = t.id
     LEFT JOIN projects p ON p.team_id = t.id
     WHERE t.tenant_id = $1
     GROUP BY t.id, up.full_name
     ORDER BY t.created_at DESC`,
    [tenantId]
  );

  return res.json({ teams: result.rows });
}));

// GET /v1/teams/:id
router.get('/teams/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId || req.query.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });

  const teamResult = await db.query(
    `SELECT t.*, up.full_name as manager_name
     FROM teams t
     LEFT JOIN user_profiles up ON up.id = t.manager_id
     WHERE t.id = $1 AND t.tenant_id = $2`,
    [id, tenantId]
  );
  if (!teamResult.rows.length) return res.status(404).json({ error: 'Team not found' });

  const [members, projects] = await Promise.all([
    db.query(
      `SELECT tm.*, up.full_name, up.phone, up.role as workspace_role, up.position, up.is_active,
              au.email
       FROM team_members tm
       JOIN user_profiles up ON up.id = tm.user_profile_id
       JOIN auth.users au ON au.id = up.user_id
       WHERE tm.team_id = $1 AND up.tenant_id = $2
       ORDER BY tm.joined_at ASC`,
      [id, tenantId]
    ),
    db.query(
      `SELECT id, name, status, lead_source, created_at
       FROM projects
       WHERE team_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [id, tenantId]
    ),
  ]);

  return res.json({
    team: teamResult.rows[0],
    members: members.rows,
    projects: projects.rows,
  });
}));

// POST /v1/teams
router.post('/teams', asyncHandler(async (req, res) => {
  const { tenantId, name, managerId, description, memberIds = [] } = req.body;
  if (!tenantId || !name?.trim()) {
    return res.status(400).json({ error: 'A team name is required' });
  }
  if (req.role && !['admin', 'manager'].includes(req.role)) {
    return res.status(403).json({ error: 'Only admins and managers can create teams' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const creator = req.userId
      ? await client.query(
          `SELECT id, role FROM user_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.userId, tenantId]
        )
      : { rows: [] };
    const creatorProfileId = creator.rows[0]?.id || null;

    let resolvedManager = managerId || creatorProfileId || null;
    if (managerId) {
      const owned = await client.query(
        `SELECT id FROM user_profiles WHERE id = $1 AND tenant_id = $2`,
        [managerId, tenantId]
      );
      if (!owned.rows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Manager must belong to this workspace' });
      }
      resolvedManager = managerId;
    }

    const result = await client.query(
      `INSERT INTO teams (tenant_id, name, manager_id, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, name.trim(), resolvedManager, description?.trim() || null]
    );
    const team = result.rows[0];

    const memberSet = new Set(
      [...memberIds, resolvedManager, creatorProfileId].filter(Boolean)
    );
    for (const profileId of memberSet) {
      const belongs = await client.query(
        `SELECT id, role FROM user_profiles WHERE id = $1 AND tenant_id = $2`,
        [profileId, tenantId]
      );
      if (!belongs.rows.length) continue;
      const workspaceRole = belongs.rows[0].role;
      const teamRole =
        profileId === resolvedManager || workspaceRole === 'admin' || workspaceRole === 'manager'
          ? 'manager'
          : 'executive';
      await client.query(
        `INSERT INTO team_members (team_id, user_profile_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, user_profile_id) DO UPDATE SET role = EXCLUDED.role`,
        [team.id, profileId, teamRole]
      );
    }

    await client.query(
      `INSERT INTO activity_logs (tenant_id, action_type, entity_type, entity_id, metadata)
       VALUES ($1, 'team_created', 'team', $2, $3)`,
      [tenantId, team.id, JSON.stringify({ name: team.name })]
    );

    await client.query('COMMIT');
    return res.json({ team });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// PATCH /v1/teams/:id
router.patch('/teams/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId, name, managerId, description } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  if (req.role && !['admin', 'manager'].includes(req.role)) {
    return res.status(403).json({ error: 'Only admins and managers can update teams' });
  }

  if (managerId) {
    const owned = await db.query(
      `SELECT id FROM user_profiles WHERE id = $1 AND tenant_id = $2`,
      [managerId, tenantId]
    );
    if (!owned.rows.length) {
      return res.status(400).json({ error: 'Manager must belong to this workspace' });
    }
  }

  const result = await db.query(
    `UPDATE teams
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         manager_id = COALESCE($3, manager_id),
         updated_at = now()
     WHERE id = $4 AND tenant_id = $5
     RETURNING *`,
    [name?.trim() || null, description === undefined ? null : description, managerId || null, id, tenantId]
  );

  if (!result.rows.length) return res.status(404).json({ error: 'Team not found' });
  return res.json({ team: result.rows[0] });
}));

// GET /v1/teams/:id/members
router.get('/teams/:id/members', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId } = req.query;

  const result = await db.query(
    `SELECT tm.*, up.full_name, up.phone, up.role, up.position, up.is_active,
            au.email
     FROM team_members tm
     JOIN user_profiles up ON up.id = tm.user_profile_id
     JOIN auth.users au ON au.id = up.user_id
     WHERE tm.team_id = $1 AND up.tenant_id = $2
     ORDER BY tm.joined_at ASC`,
    [id, tenantId]
  );

  return res.json({ members: result.rows });
}));

// POST /v1/teams/:id/members
router.post('/teams/:id/members', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tenantId, userProfileId, role = 'executive' } = req.body;

  if (!userProfileId) return res.status(400).json({ error: 'Select a person to add' });
  if (req.role && !['admin', 'manager'].includes(req.role)) {
    return res.status(403).json({ error: 'Only admins and managers can add team members' });
  }

  const team = await db.query(`SELECT id FROM teams WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  if (!team.rows.length) return res.status(404).json({ error: 'Team not found' });

  const profile = await db.query(
    `SELECT id FROM user_profiles WHERE id = $1 AND tenant_id = $2`,
    [userProfileId, tenantId]
  );
  if (!profile.rows.length) return res.status(400).json({ error: 'That person is not in this workspace' });

  const result = await db.query(
    `INSERT INTO team_members (team_id, user_profile_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_profile_id) DO UPDATE SET role = $3
     RETURNING *`,
    [id, userProfileId, role]
  );

  // Log
  await db.query(
    `INSERT INTO activity_logs (tenant_id, action_type, entity_type, entity_id, metadata)
     VALUES ($1, 'team_member_added', 'team_member', $2, $3)`,
    [tenantId, id, JSON.stringify({ user_profile_id: userProfileId, role })]
  ).catch(() => {});

  return res.json({ member: result.rows[0] });
}));

// DELETE /v1/teams/:id/members/:userProfileId
router.delete('/teams/:id/members/:userProfileId', asyncHandler(async (req, res) => {
  const { id, userProfileId } = req.params;
  const tenantId = req.tenantId || req.query.tenantId || req.body?.tenantId;

  if (req.role && !['admin', 'manager'].includes(req.role)) {
    return res.status(403).json({ error: 'Only admins and managers can remove team members' });
  }

  if (tenantId) {
    const team = await db.query(`SELECT id FROM teams WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (!team.rows.length) return res.status(404).json({ error: 'Team not found' });
  }

  await db.query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_profile_id = $2`,
    [id, userProfileId]
  );

  return res.json({ success: true });
}));

module.exports = router;
