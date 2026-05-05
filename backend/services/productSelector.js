/**
 * Product Selector — Phase 2 of V3 Calling Stack Upgrade
 *
 * Rule-based product selection before the call.
 * Picks top 3–5 relevant products based on lead context.
 * No AI by default — deterministic, fast, and cheap.
 */

const db = require('../db');

const MAX_INITIAL_PRODUCTS = 5;

/**
 * Score a single product against lead context using rule-based matching.
 * Returns a numeric score (higher = more relevant).
 */
function scoreProduct(product, leadContext = {}) {
  let score = 0;
  const {
    preferred_location,
    property_type,
    budget,
    possession_preference,
    inquiry = '',
    lead_budget,
    lead_location,
    lead_property_type,
  } = leadContext;

  // Merge context field aliases
  const loc = (preferred_location || lead_location || '').toLowerCase();
  const propType = (property_type || lead_property_type || '').toLowerCase();
  const budgetHint = (budget || lead_budget || '').toLowerCase();
  const possHint = (possession_preference || '').toLowerCase();
  const inquiryLower = (inquiry || '').toLowerCase();

  // Location match (+3)
  if (loc && product.location) {
    const pLoc = product.location.toLowerCase();
    if (pLoc.includes(loc) || loc.includes(pLoc)) score += 3;
  }

  // Property type match (+2)
  if (propType && product.property_type) {
    const pType = product.property_type.toLowerCase();
    if (pType.includes(propType) || propType.includes(pType)) score += 2;
  }

  // Possession preference match (+2)
  if (possHint && product.possession_status) {
    const pPoss = product.possession_status.toLowerCase();
    if (pPoss.includes(possHint) || possHint.includes(pPoss)) score += 2;
  }

  // Budget mentioned and product has price (+1)
  if (budgetHint && product.price_range) score += 1;

  // Inquiry keyword overlap with product name (+1)
  if (inquiryLower && product.name) {
    const pName = product.name.toLowerCase().split(' ')[0]; // first word
    if (inquiryLower.includes(pName)) score += 1;
  }

  return score;
}

/**
 * Select top products for a project, filtered by lead context.
 *
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {string} opts.tenantId
 * @param {object} [opts.leadContext] - extracted intent / lead context
 * @param {number} [opts.limit] - max products to return (default 5)
 * @returns {Promise<object[]>}
 */
async function selectProducts({ projectId, tenantId, leadContext = {}, limit = MAX_INITIAL_PRODUCTS }) {
  if (!projectId) return [];

  const result = await db.query(
    `SELECT id, name, property_type, location, price_range, size, possession_status, amenities, extra_details
     FROM kb_products
     WHERE project_id = $1 AND tenant_id = $2 AND is_active = true
     ORDER BY created_at ASC`,
    [projectId, tenantId]
  );
  const products = result.rows;

  if (products.length === 0) return [];
  if (products.length <= limit) return products; // return all if within limit

  // Score and rank
  const scored = products
    .map((p) => ({ ...p, _score: scoreProduct(p, leadContext) }))
    .sort((a, b) => b._score - a._score);

  return scored.slice(0, limit).map(({ _score, ...p }) => p);
}

/**
 * Search products by free-text query + filters.
 * Used by the agent's runtime search_project_products tool.
 *
 * @param {object} opts
 * @param {string} opts.projectId
 * @param {string} opts.tenantId  - required for security scoping
 * @param {object} [opts.filters] - { location, property_type, possession_status, max_price }
 * @param {string} [opts.query]   - free text search
 * @returns {Promise<object[]>}
 */
async function searchProducts({ projectId, tenantId, filters = {}, query = '' }) {
  if (!projectId || !tenantId) return [];

  let sql = `
    SELECT id, name, property_type, location, price_range, size, possession_status, amenities
    FROM kb_products
    WHERE project_id = $1 AND tenant_id = $2 AND is_active = true
  `;
  const params = [projectId, tenantId];

  if (filters.location) {
    params.push(`%${filters.location.toLowerCase()}%`);
    sql += ` AND LOWER(location) LIKE $${params.length}`;
  }
  if (filters.property_type) {
    params.push(`%${filters.property_type.toLowerCase()}%`);
    sql += ` AND LOWER(property_type) LIKE $${params.length}`;
  }
  if (filters.possession_status) {
    params.push(`%${filters.possession_status.toLowerCase()}%`);
    sql += ` AND LOWER(possession_status) LIKE $${params.length}`;
  }

  sql += ` ORDER BY created_at ASC LIMIT 5`;

  const result = await db.query(sql, params);
  let products = result.rows;

  // If free text query provided, re-rank by relevance
  if (query && products.length > 1) {
    const qLower = query.toLowerCase();
    products = products
      .map((p) => {
        let score = 0;
        if (p.name?.toLowerCase().includes(qLower)) score += 3;
        if (p.location?.toLowerCase().includes(qLower)) score += 2;
        if (p.property_type?.toLowerCase().includes(qLower)) score += 2;
        if (p.possession_status?.toLowerCase().includes(qLower)) score += 1;
        if (p.amenities?.toLowerCase().includes(qLower)) score += 1;
        return { ...p, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...p }) => p);
  }

  return products;
}

module.exports = { selectProducts, searchProducts, scoreProduct };
