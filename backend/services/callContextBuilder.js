/**
 * Call Context Builder — Phase 1 of V3 Calling Stack Upgrade
 *
 * Builds a compact, structured call brief for the AI agent.
 * Does NOT inject full KB text — produces a small, focused object.
 * This replaces the inline KB fetching in /v1/calls/start.
 */

const db = require('../db');

/**
 * Build a compact call brief.
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {string} opts.leadId
 * @returns {Promise<object>} call brief
 */
async function buildCallContext({ tenantId, leadId }) {
  // ── 1. Lead ──────────────────────────────────────────────────────────────────
  const leadResult = await db.query(
    `SELECT id, name, phone, email, inquiry, source, status, project_id, assigned_to, metadata
     FROM leads WHERE id = $1 AND tenant_id = $2`,
    [leadId, tenantId]
  );
  if (leadResult.rows.length === 0) throw new Error(`Lead not found: ${leadId}`);
  const lead = leadResult.rows[0];

  // ── 2. Tenant ─────────────────────────────────────────────────────────────────
  const tenantResult = await db.query(
    `SELECT id, name, settings, plan FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const tenant = tenantResult.rows[0] || {};

  // ── 3. Tenant KB (brand voice + calling rules only — keep compact) ────────────
  const tenantKbResult = await db.query(
    `SELECT brand_voice, calling_rules, company_instructions
     FROM knowledge_bases WHERE tenant_id = $1 AND type = 'tenant'
     ORDER BY updated_at DESC LIMIT 1`,
    [tenantId]
  );
  const tenantKb = tenantKbResult.rows[0] || null;

  // ── 4. Project ────────────────────────────────────────────────────────────────
  let project = null;
  let projectKb = null;
  if (lead.project_id) {
    const projResult = await db.query(
      `SELECT id, name, description, settings FROM projects WHERE id = $1 AND tenant_id = $2`,
      [lead.project_id, tenantId]
    );
    project = projResult.rows[0] || null;

    if (project) {
      const pkbResult = await db.query(
        `SELECT brand_voice, calling_rules, company_instructions
         FROM knowledge_bases
         WHERE tenant_id = $1 AND project_id = $2 AND type = 'project'
         ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, lead.project_id]
      );
      projectKb = pkbResult.rows[0] || null;
    }
  }

  // ── 5. Lead context (persistent call memory from previous calls) ──────────────
  let leadCtx = null;
  try {
    const lcResult = await db.query(
      `SELECT * FROM lead_context WHERE lead_id = $1 AND tenant_id = $2`,
      [leadId, tenantId]
    );
    leadCtx = lcResult.rows[0] || null;
  } catch (_) {
    /* lead_context table may not exist in very old deploys — safe fallback */
  }

  // ── 6. Previous calls (for follow-up context) — scoped to tenant ──────────────
  const prevCallsResult = await db.query(
    `SELECT c.id, c.outcome, c.duration_seconds, c.ended_at, ct.summary
     FROM calls c
     LEFT JOIN call_transcripts ct ON c.id = ct.call_id
     WHERE c.lead_id = $1 AND c.tenant_id = $2 AND c.status = 'completed'
     ORDER BY c.ended_at DESC NULLS LAST LIMIT 3`,
    [leadId, tenantId]
  );
  const prevCalls = prevCallsResult.rows;

  // ── 7. Last appointment — scoped to tenant ────────────────────────────────────
  const apptResult = await db.query(
    `SELECT scheduled_at, status, notes FROM appointments
     WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [leadId, tenantId]
  );
  const lastAppt = apptResult.rows[0] || null;

  // ── 8. Determine call type ─────────────────────────────────────────────────────
  const totalPrevCalls = prevCalls.length + (leadCtx?.call_count || 0);
  const callType = totalPrevCalls === 0 ? 'fresh' : 'follow_up';

  // ── 9. Build previous context summary ─────────────────────────────────────────
  let lastSummary = leadCtx?.last_summary || '';
  let lastOutcome = leadCtx?.last_outcome || '';
  let lastContactedAt = leadCtx?.last_contacted_at || null;

  if (prevCalls.length > 0 && !lastSummary) {
    const latest = prevCalls[0];
    lastSummary = latest.summary || '';
    lastOutcome = latest.outcome || '';
    lastContactedAt = latest.ended_at || null;
  }

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      source: lead.source || null,
      inquiry: lead.inquiry || null,
      assigned_to: lead.assigned_to || null,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      tone: tenantKb?.brand_voice || null,
      brand_voice: tenantKb?.brand_voice || null,
      calling_rules: tenantKb?.calling_rules || null,
      company_instructions: tenantKb?.company_instructions || null,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          description: project.description || null,
          call_goal: project.settings?.call_goal || null,
          calling_rules: projectKb?.calling_rules || null,
          company_instructions: projectKb?.company_instructions || null,
        }
      : null,
    call_context: {
      call_type: callType,
      last_summary: lastSummary || null,
      last_outcome: lastOutcome || null,
      last_contacted_at: lastContactedAt,
      previous_objections: leadCtx?.objections || [],
      previous_interest_level: leadCtx?.interest_level || null,
      appointment_status: lastAppt?.status || null,
      lead_budget: leadCtx?.budget || null,
      lead_location: leadCtx?.preferred_location || null,
      lead_property_type: leadCtx?.property_type || null,
    },
    rules: {
      max_products_to_pitch: 3,
      do_not_discuss_other_projects: true,
    },
    _meta: {
      lead_project_id: lead.project_id || null,
      tenant_id: tenantId,
      builder_version: 'v3',
    },
  };
}

module.exports = { buildCallContext };
