/**
 * Exclusive assignment. Admins and managers see every lead in the tenant.
 * Other roles see unassigned leads and leads assigned to their own profile.
 * assigned_to stores user_profiles.id, not the auth user id.
 */

function seesAllLeads(role) {
  return role === 'admin' || role === 'manager';
}

function visibilitySql(alias, role, userParam) {
  if (seesAllLeads(role)) return { sql: '', params: [] };
  return {
    sql: ` AND (${alias}.assigned_to IS NULL OR ${alias}.assigned_to = (SELECT id FROM user_profiles WHERE user_id = $${userParam} AND tenant_id = ${alias}.tenant_id LIMIT 1))`,
    params: [],
  };
}

function canViewLead(role, lead, profileId) {
  if (!lead) return false;
  if (seesAllLeads(role)) return true;
  if (!lead.assigned_to) return true;
  return Boolean(profileId) && String(lead.assigned_to) === String(profileId);
}

module.exports = { seesAllLeads, visibilitySql, canViewLead };
