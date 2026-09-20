/**
 * Resolve which project an AI call should use.
 * Never silently invents a project when more than one is active.
 *
 * Hierarchy:
 * 1. explicit / supplied project_id (tenant-owned)
 * 2. tenant.settings.default_project_id
 * 3. tenant.settings.source_project_map[source] (explicit map only)
 * 4. exactly one active project
 * 5. unresolved — do not enqueue a generic call
 */

const db = require('../db');

const RESOLUTION = {
  supplied: 'explicit',
  default_setting: 'default',
  source_routing: 'source_routing',
  single_active: 'single_active',
  unassigned: 'unresolved',
  invalid: 'unresolved',
};

function pack(row) {
  return {
    ...row,
    resolution: RESOLUTION[row.reason] || 'unresolved',
  };
}

function decideProjectAssignment({ supplied, defaultProject, sourceRouted, activeProjects = [] }) {
  if (supplied) {
    return pack({
      projectId: supplied.id,
      projectName: supplied.name,
      reason: 'supplied',
      needsAssignment: false,
      activeCount: 1,
    });
  }
  if (defaultProject) {
    return pack({
      projectId: defaultProject.id,
      projectName: defaultProject.name,
      reason: 'default_setting',
      needsAssignment: false,
      activeCount: 1,
    });
  }
  if (sourceRouted) {
    return pack({
      projectId: sourceRouted.id,
      projectName: sourceRouted.name,
      reason: 'source_routing',
      needsAssignment: false,
      activeCount: 1,
    });
  }
  if (activeProjects.length === 1) {
    return pack({
      projectId: activeProjects[0].id,
      projectName: activeProjects[0].name,
      reason: 'single_active',
      needsAssignment: false,
      activeCount: 1,
    });
  }
  return pack({
    projectId: null,
    projectName: null,
    reason: 'unassigned',
    needsAssignment: true,
    activeCount: activeProjects.length,
  });
}

/**
 * Shared resolver for ingest, webhook, Meta, CSV, and Start AI Call.
 *
 * @returns {Promise<{
 *   projectId: string|null,
 *   projectName: string|null,
 *   reason: string,
 *   resolution: 'explicit'|'default'|'source_routing'|'single_active'|'unresolved',
 *   needsAssignment: boolean,
 *   activeCount: number
 * }>}
 */
async function resolveProject({ tenantId, projectId, source, metadata, integrationKey, client } = {}) {
  return resolveProjectForLead({ tenantId, suppliedProjectId: projectId, source, metadata, integrationKey, client });
}

async function resolveProjectForLead({
  tenantId,
  suppliedProjectId,
  source,
  metadata,
  integrationKey,
  client,
} = {}) {
  const q = client ? (text, params) => client.query(text, params) : db.query;
  if (!tenantId) {
    return empty('unassigned');
  }

  const explicitId = suppliedProjectId || metadata?.project_id || metadata?.projectId || null;
  if (explicitId) {
    const owned = await q(
      `SELECT id, name, status FROM projects WHERE id = $1 AND tenant_id = $2`,
      [explicitId, tenantId]
    );
    if (owned.rows.length) {
      return pack({
        projectId: owned.rows[0].id,
        projectName: owned.rows[0].name,
        reason: 'supplied',
        needsAssignment: false,
        activeCount: 1,
      });
    }
    return { ...empty('invalid'), activeCount: 0 };
  }

  const tenant = await q(`SELECT settings FROM tenants WHERE id = $1`, [tenantId]);
  const settings = tenant.rows[0]?.settings || {};
  const defaultId = settings.default_project_id || null;
  if (defaultId) {
    const def = await q(
      `SELECT id, name FROM projects WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [defaultId, tenantId]
    );
    if (def.rows.length) {
      return pack({
        projectId: def.rows[0].id,
        projectName: def.rows[0].name,
        reason: 'default_setting',
        needsAssignment: false,
        activeCount: 1,
      });
    }
  }

  const routedId = lookupSourceMap(settings.source_project_map, source, integrationKey);
  if (routedId) {
    const routed = await q(
      `SELECT id, name FROM projects WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
      [routedId, tenantId]
    );
    if (routed.rows.length) {
      return pack({
        projectId: routed.rows[0].id,
        projectName: routed.rows[0].name,
        reason: 'source_routing',
        needsAssignment: false,
        activeCount: 1,
      });
    }
  }

  const active = await q(
    `SELECT id, name FROM projects WHERE tenant_id = $1 AND status = 'active' ORDER BY created_at ASC`,
    [tenantId]
  );
  if (active.rows.length === 1) {
    return pack({
      projectId: active.rows[0].id,
      projectName: active.rows[0].name,
      reason: 'single_active',
      needsAssignment: false,
      activeCount: 1,
    });
  }

  return pack({
    projectId: null,
    projectName: null,
    reason: 'unassigned',
    needsAssignment: true,
    activeCount: active.rows.length,
  });
}

function lookupSourceMap(map, source, integrationKey) {
  if (!map || typeof map !== 'object') return null;
  const keys = [source, integrationKey].filter(Boolean).map((k) => String(k).trim());
  for (const key of keys) {
    if (map[key]) return map[key];
    const lower = key.toLowerCase();
    const hit = Object.keys(map).find((k) => String(k).toLowerCase() === lower);
    if (hit && map[hit]) return map[hit];
  }
  return null;
}

function empty(reason) {
  return pack({
    projectId: null,
    projectName: null,
    reason,
    needsAssignment: reason === 'unassigned' || reason === 'invalid',
    activeCount: 0,
  });
}

module.exports = { resolveProject, resolveProjectForLead, decideProjectAssignment };
