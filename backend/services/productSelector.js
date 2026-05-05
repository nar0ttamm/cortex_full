/**
 * Product Selector — Phase 2 of V3 Calling Stack Upgrade
 *
 * Rule-based product selection before the call.
 * Picks top 3–5 relevant products based on lead context.
 * No AI by default — deterministic, fast, and cheap.
 */

const db = require('../db');

const MAX_INITIAL_PRODUCTS = 5;

// ── Budget parsing helpers ────────────────────────────────────────────────────

/**
 * Extract a numeric value (in lakhs) from a budget string.
 * e.g. "80 lakhs", "1.5 crore", "₹75L" → number
 */
function parseBudgetLakhs(str = '') {
  if (!str) return null;
  const s = str.toLowerCase().replace(/,/g, '');
  const crore = s.match(/(\d+(?:\.\d+)?)\s*cr/);
  if (crore) return parseFloat(crore[1]) * 100;
  const lakh = s.match(/(\d+(?:\.\d+)?)\s*(?:l(?:ac|akh)?)/);
  if (lakh) return parseFloat(lakh[1]);
  const plain = s.match(/(\d{5,})/); // bare number ≥ 5 digits treated as rupees
  if (plain) return parseInt(plain[1], 10) / 100000;
  return null;
}

/**
 * Extract min/max from a price_range string like "70-90 Lakhs" or "1.2-1.8 Cr".
 */
function parsePriceRange(str = '') {
  if (!str) return null;
  const s = str.toLowerCase().replace(/,/g, '');
  const multi = s.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*(l|cr)/);
  if (multi) {
    const factor = multi[3] === 'cr' ? 100 : 1;
    return { min: parseFloat(multi[1]) * factor, max: parseFloat(multi[2]) * factor };
  }
  const single = parseBudgetLakhs(str);
  if (single) return { min: single * 0.85, max: single * 1.15 }; // ±15% tolerance
  return null;
}

// ── Fuzzy location tokenizer ─────────────────────────────────────────────────

/**
 * Tokenize a location string into words for fuzzy matching.
 * e.g. "Navi Mumbai" → ["navi", "mumbai"]
 */
function tokenizeLocation(str = '') {
  return str.toLowerCase().split(/[\s,/-]+/).filter((w) => w.length > 2);
}

/**
 * Compute location similarity score between lead location and product location.
 * Full match = 3, partial token match = 1 per shared token (max 2), no match = 0.
 */
function locationScore(leadLoc, productLoc) {
  if (!leadLoc || !productLoc) return 0;
  const pLoc = productLoc.toLowerCase();
  const lLoc = leadLoc.toLowerCase();

  // Exact substring match
  if (pLoc.includes(lLoc) || lLoc.includes(pLoc)) return 3;

  // Token overlap
  const leadTokens = tokenizeLocation(lLoc);
  const prodTokens = tokenizeLocation(pLoc);
  const shared = leadTokens.filter((t) => prodTokens.some((p) => p.includes(t) || t.includes(p)));
  return Math.min(shared.length, 2);
}

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
  const loc = preferred_location || lead_location || '';
  const propType = (property_type || lead_property_type || '').toLowerCase();
  const budgetHint = budget || lead_budget || '';
  const possHint = (possession_preference || '').toLowerCase();
  const inquiryLower = (inquiry || '').toLowerCase();

  // Fuzzy location match (+0–3)
  score += locationScore(loc, product.location || '');

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

  // Budget range compatibility (+2 if within range, +1 if budget exists and product has price)
  if (budgetHint && product.price_range) {
    const leadBudget = parseBudgetLakhs(budgetHint);
    const priceRange = parsePriceRange(product.price_range);
    if (leadBudget && priceRange) {
      if (leadBudget >= priceRange.min && leadBudget <= priceRange.max) {
        score += 2; // within range
      } else if (leadBudget >= priceRange.min * 0.8) {
        score += 1; // close to range
      }
    } else {
      score += 1; // budget exists but can't parse — give small boost
    }
  }

  // Inquiry keyword overlap with product name/location (+1)
  if (inquiryLower) {
    const pName = (product.name || '').toLowerCase();
    const pLoc = (product.location || '').toLowerCase();
    if (pName.split(' ').some((w) => w.length > 3 && inquiryLower.includes(w))) score += 1;
    if (tokenizeLocation(pLoc).some((t) => inquiryLower.includes(t))) score += 1;
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
  if (products.length <= 3) return products; // always return all when few products

  // Score and rank
  const scored = products
    .map((p) => ({ ...p, _score: scoreProduct(p, leadContext) }))
    .sort((a, b) => b._score - a._score);

  // Guarantee minimum 3 products — take top `limit` but at least 3
  const topScored = scored.slice(0, limit).map(({ _score, ...p }) => p);
  if (topScored.length >= 3) return topScored;

  // Fallback: fill up to 3 with remaining products (unscored order)
  const selected = [...topScored];
  for (const { _score: _s, ...p } of scored) {
    if (selected.length >= 3) break;
    if (!selected.find((s) => s.id === p.id)) selected.push(p);
  }
  return selected;
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
