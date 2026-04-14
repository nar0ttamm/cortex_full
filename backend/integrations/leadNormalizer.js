/**
 * Universal lead field normalizer.
 * Maps external platform field names to the internal schema.
 * Supports: Meta Lead Ads, Google Lead Forms, IndiaMART, Justdial, Zapier, Typeform, Tally
 */

// Common field name variants across platforms
const NAME_FIELDS = [
  'name', 'full_name', 'fullName', 'contact_name', 'customer_name',
  'first_name', 'firstName', 'SENDER_NAME', 'sender_name',
];

const PHONE_FIELDS = [
  'phone', 'phone_number', 'phoneNumber', 'mobile', 'mobile_number',
  'mobileNumber', 'contact', 'contact_number', 'MOBILE', 'PHONE',
  'whatsapp', 'cell', 'telephone',
];

const EMAIL_FIELDS = [
  'email', 'email_address', 'emailAddress', 'EMAIL', 'e_mail', 'e-mail',
];

const MESSAGE_FIELDS = [
  'message', 'inquiry', 'enquiry', 'note', 'notes', 'description',
  'comment', 'comments', 'query', 'requirement', 'requirements',
  'interest', 'subject', 'body', 'QUERY',
];

const SOURCE_FIELDS = [
  'source', 'lead_source', 'leadSource', 'platform', 'channel', 'utm_source',
];

function extractField(data, fieldList) {
  for (const field of fieldList) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      return String(data[field]).trim();
    }
  }
  return null;
}

/**
 * Handle Meta Lead Ads format (nested field_data array)
 * { field_data: [{ name: "full_name", values: ["John"] }, ...] }
 */
function flattenMetaLeadAds(data) {
  if (!Array.isArray(data.field_data)) return data;

  const flat = {};
  for (const field of data.field_data) {
    flat[field.name] = field.values?.[0] || '';
  }
  return flat;
}

/**
 * Handle Typeform format
 * { answers: [{ field: { ref: "name_field" }, text: "John" }] }
 */
function flattenTypeform(data) {
  if (!Array.isArray(data.answers)) return data;

  const flat = { source: 'Typeform' };
  for (const answer of data.answers) {
    const ref = answer.field?.ref || answer.field?.id || '';
    const value = answer.text || answer.email || answer.phone_number || answer.number || '';
    flat[ref] = value;
    flat[answer.field?.title?.toLowerCase()?.replace(/\s+/g, '_') || ref] = value;
  }
  return flat;
}

/**
 * Normalize any incoming lead payload to internal schema.
 * @param {object} raw - Raw incoming payload
 * @param {string} integrationKey - Which integration sent this
 * @returns {{ name, phone, email, message, source, metadata }}
 */
function normalizeLead(raw, integrationKey = 'webhook') {
  // Detect and flatten nested formats
  let data = raw;

  if (raw.field_data) {
    data = flattenMetaLeadAds(raw);
  } else if (raw.answers && raw.form_response) {
    data = flattenTypeform(raw.form_response || raw);
  } else if (raw.answers) {
    data = flattenTypeform(raw);
  }

  const name = extractField(data, NAME_FIELDS);
  const phone = extractField(data, PHONE_FIELDS);
  const email = extractField(data, EMAIL_FIELDS);
  const message = extractField(data, MESSAGE_FIELDS);
  const rawSource = extractField(data, SOURCE_FIELDS);

  // Source mapping
  const SOURCE_MAP = {
    facebook: 'Meta Lead Ads',
    fb: 'Meta Lead Ads',
    meta: 'Meta Lead Ads',
    google: 'Google Lead Form',
    indiamart: 'IndiaMART',
    justdial: 'Justdial',
    zapier: 'Zapier',
    typeform: 'Typeform',
    tally: 'Tally Form',
    webhook: 'Webhook',
  };

  const source = SOURCE_MAP[rawSource?.toLowerCase()] ||
    SOURCE_MAP[integrationKey?.toLowerCase()] ||
    rawSource ||
    integrationKey ||
    'Webhook';

  // Collect all extra fields as metadata
  const knownFields = new Set([
    ...NAME_FIELDS, ...PHONE_FIELDS, ...EMAIL_FIELDS,
    ...MESSAGE_FIELDS, ...SOURCE_FIELDS,
    'field_data', 'answers', 'form_response',
  ]);
  const extraMetadata = {};
  for (const [key, val] of Object.entries(data)) {
    if (!knownFields.has(key) && val !== null && val !== undefined) {
      extraMetadata[key] = val;
    }
  }

  return {
    name: name || 'Unknown',
    phone: phone || null,
    email: email || null,
    message: message || null,
    source,
    metadata: Object.keys(extraMetadata).length > 0 ? extraMetadata : null,
  };
}

module.exports = { normalizeLead };
