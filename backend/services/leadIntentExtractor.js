/**
 * Lead Intent Extractor — Phase 3 of V3 Calling Stack Upgrade
 *
 * Extracts structured intent from lead inquiry text.
 * Rule/regex-based first. AI fallback only when rules are insufficient.
 * Result stored in lead_context table.
 */

const db = require('../db');

// ── Budget patterns ───────────────────────────────────────────────────────────
const BUDGET_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*cr(?:ore)?s?/i,
  /(\d+(?:\.\d+)?)\s*l(?:ac|akh)s?/i,
  /budget[:\s]+(?:rs\.?\s*)?(\d[\d,]*)/i,
  /(?:rs\.?\s*|₹\s*)(\d[\d,]*(?:\s*(?:lac|lakh|cr|crore))?)/i,
];

// ── Location keywords (extendable) ───────────────────────────────────────────
const LOCATION_KEYWORDS = [
  'chembur', 'andheri', 'bandra', 'goregaon', 'malad', 'kandivali', 'borivali',
  'thane', 'navi mumbai', 'pune', 'delhi', 'noida', 'gurgaon', 'gurugram',
  'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'ahmedabad', 'kolkata',
  'kharghar', 'panvel', 'powai', 'vikhroli', 'kurla', 'dombivali', 'kalyan',
  'vasai', 'virar', 'palghar', 'mira road', 'bhayandar', 'ulhasnagar',
  'ambernath', 'badlapur', 'karjat', 'khopoli', 'lonavala', 'pune', 'wakad',
  'hinjewadi', 'kharadi', 'viman nagar', 'kothrud', 'baner', 'balewadi',
  'whitefield', 'sarjapur', 'electronic city', 'hebbal', 'yelahanka',
  'gachibowli', 'financial district', 'kokapet', 'kondapur', 'manikonda',
  'dwarka', 'rohini', 'janakpuri', 'uttam nagar', 'lajpat nagar', 'vasant kunj',
  'sector 150', 'sector 137', 'techzone', 'greater noida', 'nh 24', 'raj nagar',
];

// ── Property type patterns ────────────────────────────────────────────────────
const PROPERTY_TYPE_PATTERNS = [
  { pattern: /\b1\s*bhk\b/i, type: '1BHK' },
  { pattern: /\b2\s*bhk\b/i, type: '2BHK' },
  { pattern: /\b3\s*bhk\b/i, type: '3BHK' },
  { pattern: /\b4\s*bhk\b/i, type: '4BHK' },
  { pattern: /\b5\s*bhk\b/i, type: '5BHK' },
  { pattern: /\bstudio\b/i, type: 'Studio' },
  { pattern: /\bplot\b/i, type: 'Plot' },
  { pattern: /\bvilla\b/i, type: 'Villa' },
  { pattern: /\bpenthou?se\b/i, type: 'Penthouse' },
  { pattern: /\bcommercial\b/i, type: 'Commercial' },
  { pattern: /\boffice\s*space\b/i, type: 'Office' },
  { pattern: /\bshop\b/i, type: 'Shop' },
  { pattern: /\bwarehouse\b/i, type: 'Warehouse' },
  { pattern: /\bflat\b/i, type: 'Flat' },
  { pattern: /\bapartment\b/i, type: 'Apartment' },
];

// ── Possession preference patterns ───────────────────────────────────────────
const POSSESSION_PATTERNS = [
  { pattern: /\bready\s*(?:to\s*move|possession)\b/i, value: 'ready_to_move' },
  { pattern: /\bimmediate\s*possession\b/i, value: 'ready_to_move' },
  { pattern: /\bunder\s*construction\b/i, value: 'under_construction' },
  { pattern: /\bnew\s*launch\b/i, value: 'new_launch' },
  { pattern: /\b(?:2024|2025|2026|2027|2028)\s*possession\b/i, value: 'near_possession' },
];

// ── Timeline patterns ─────────────────────────────────────────────────────────
const TIMELINE_PATTERNS = [
  { pattern: /\bimmediately\b|\basap\b|\burgent\b/i, value: 'immediate' },
  { pattern: /\b1\s*month\b|\bone\s*month\b/i, value: '1_month' },
  { pattern: /\b3\s*months?\b|\bthree\s*months?\b/i, value: '3_months' },
  { pattern: /\b6\s*months?\b|\bsix\s*months?\b/i, value: '6_months' },
  { pattern: /\b1\s*year\b|\bone\s*year\b/i, value: '1_year' },
  { pattern: /\bjust\s*(?:looking|browsing|exploring)\b/i, value: 'exploring' },
];

/**
 * Extract intent from inquiry text using rules/regex.
 * Returns a partial intent object — fields may be null/undefined if not detected.
 *
 * @param {string} inquiry
 * @returns {object} extracted intent fields
 */
function extractIntent(inquiry = '') {
  if (!inquiry || inquiry.trim().length < 3) return {};

  const text = inquiry.trim();
  const textLower = text.toLowerCase();
  const result = {};

  // Budget
  for (const pattern of BUDGET_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      result.budget = match[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // Location (longest match wins to prefer "navi mumbai" over "mumbai")
  let bestLocMatch = '';
  for (const loc of LOCATION_KEYWORDS) {
    if (textLower.includes(loc) && loc.length > bestLocMatch.length) {
      bestLocMatch = loc;
    }
  }
  if (bestLocMatch) {
    result.preferred_location = bestLocMatch.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Property type (first match wins)
  for (const { pattern, type } of PROPERTY_TYPE_PATTERNS) {
    if (pattern.test(text)) {
      result.property_type = type;
      break;
    }
  }

  // Possession preference
  for (const { pattern, value } of POSSESSION_PATTERNS) {
    if (pattern.test(text)) {
      result.possession_preference = value;
      break;
    }
  }

  // Timeline
  for (const { pattern, value } of TIMELINE_PATTERNS) {
    if (pattern.test(text)) {
      result.timeline = value;
      break;
    }
  }

  return result;
}

/**
 * Extract intent and persist to lead_context table.
 * Merges with existing context (does not overwrite non-null fields).
 *
 * @param {object} opts
 * @param {string} opts.leadId
 * @param {string} opts.tenantId
 * @param {string} [opts.projectId]
 * @param {string} [opts.inquiry]
 * @returns {Promise<object>} merged context
 */
async function extractAndStoreIntent({ leadId, tenantId, projectId, inquiry }) {
  const extracted = extractIntent(inquiry);

  if (Object.keys(extracted).length === 0) return extracted;

  try {
    // Upsert — only set fields that we extracted (don't overwrite existing richer data)
    await db.query(
      `INSERT INTO lead_context (lead_id, tenant_id, project_id, budget, preferred_location, property_type, timeline, possession_preference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (lead_id) DO UPDATE SET
         budget              = COALESCE(lead_context.budget, EXCLUDED.budget),
         preferred_location  = COALESCE(lead_context.preferred_location, EXCLUDED.preferred_location),
         property_type       = COALESCE(lead_context.property_type, EXCLUDED.property_type),
         timeline            = COALESCE(lead_context.timeline, EXCLUDED.timeline),
         possession_preference = COALESCE(lead_context.possession_preference, EXCLUDED.possession_preference),
         updated_at          = NOW()`,
      [
        leadId,
        tenantId,
        projectId || null,
        extracted.budget || null,
        extracted.preferred_location || null,
        extracted.property_type || null,
        extracted.timeline || null,
        extracted.possession_preference || null,
      ]
    );
  } catch (err) {
    console.warn('[leadIntentExtractor] Failed to store intent:', err.message);
  }

  return extracted;
}

/**
 * Update lead memory after a call (Phase 7).
 * Merges new memory fields into lead_context, increments call_count.
 *
 * @param {object} opts
 * @param {string} opts.leadId
 * @param {string} opts.tenantId
 * @param {string} [opts.projectId]
 * @param {string} [opts.budget]
 * @param {string} [opts.preferred_location]
 * @param {string} [opts.property_type]
 * @param {string} [opts.timeline]
 * @param {string} [opts.interest_level]   high|medium|low|not_interested
 * @param {string} [opts.objection]
 * @param {string} [opts.callback_time]
 * @param {boolean} [opts.appointment_interest]
 * @param {string} [opts.last_summary]
 * @param {string} [opts.last_outcome]
 */
async function updateLeadMemory({
  leadId,
  tenantId,
  projectId,
  budget,
  preferred_location,
  property_type,
  timeline,
  interest_level,
  objection,
  callback_time,
  appointment_interest,
  last_summary,
  last_outcome,
}) {
  try {
    await db.query(
      `INSERT INTO lead_context (lead_id, tenant_id, project_id, budget, preferred_location, property_type,
         timeline, interest_level, callback_time, appointment_interest, last_summary, last_outcome,
         last_contacted_at, call_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), 1)
       ON CONFLICT (lead_id) DO UPDATE SET
         budget              = COALESCE(EXCLUDED.budget,             lead_context.budget),
         preferred_location  = COALESCE(EXCLUDED.preferred_location, lead_context.preferred_location),
         property_type       = COALESCE(EXCLUDED.property_type,      lead_context.property_type),
         timeline            = COALESCE(EXCLUDED.timeline,           lead_context.timeline),
         interest_level      = COALESCE(EXCLUDED.interest_level,     lead_context.interest_level),
         callback_time       = COALESCE(EXCLUDED.callback_time,      lead_context.callback_time),
         appointment_interest = COALESCE(EXCLUDED.appointment_interest, lead_context.appointment_interest),
         last_summary        = COALESCE(EXCLUDED.last_summary,       lead_context.last_summary),
         last_outcome        = COALESCE(EXCLUDED.last_outcome,       lead_context.last_outcome),
         previous_interest_level = lead_context.interest_level,
         last_contacted_at   = NOW(),
         call_count          = lead_context.call_count + 1,
         updated_at          = NOW()`,
      [
        leadId,
        tenantId,
        projectId || null,
        budget || null,
        preferred_location || null,
        property_type || null,
        timeline || null,
        interest_level || null,
        callback_time || null,
        appointment_interest != null ? Boolean(appointment_interest) : null,
        last_summary || null,
        last_outcome || null,
      ]
    );

    // Append objection to list if provided
    if (objection) {
      await db.query(
        `UPDATE lead_context
         SET objections = COALESCE(objections, '[]'::jsonb) || $1::jsonb, updated_at = NOW()
         WHERE lead_id = $2`,
        [JSON.stringify([objection]), leadId]
      );
    }
  } catch (err) {
    console.warn('[leadIntentExtractor] updateLeadMemory failed:', err.message);
  }
}

module.exports = { extractIntent, extractAndStoreIntent, updateLeadMemory };
