const COLUMN_MAP = {
  FULL_NAME: 'name',
  FIRST_NAME: 'first_name',
  LAST_NAME: 'last_name',
  PHONE_NUMBER: 'phone',
  EMAIL: 'email',
  CITY: 'city',
  POSTAL_CODE: 'postal_code',
  REGION: 'region',
  COUNTRY: 'country',
  COMPANY_NAME: 'company',
  JOB_TITLE: 'job_title',
  WORK_EMAIL: 'email',
  WORK_PHONE: 'phone',
};

function columnValue(column) {
  if (!column) return '';
  return String(column.string_value || column.column_value || '').trim();
}

function mapGoogleAdsLead(payload) {
  const fields = {};
  (payload?.user_column_data || []).forEach((column) => {
    const key = COLUMN_MAP[column.column_id] || String(column.column_id || 'field').toLowerCase();
    const value = columnValue(column);
    if (value && !fields[key]) fields[key] = value;
  });
  const name = fields.name || [fields.first_name, fields.last_name].filter(Boolean).join(' ') || 'Google Ads lead';
  const phone = String(fields.phone || '').replace(/[^\d+]/g, '');
  return {
    leadId: payload?.lead_id ? String(payload.lead_id) : '',
    formId: payload?.form_id != null ? String(payload.form_id) : '',
    campaignId: payload?.campaign_id != null ? String(payload.campaign_id) : '',
    gclId: payload?.gcl_id || '',
    isTest: payload?.is_test === true,
    googleKey: payload?.google_key || '',
    name,
    phone,
    email: fields.email || '',
    inquiry: fields.company ? `Company: ${fields.company}` : '',
    fields,
  };
}

module.exports = { mapGoogleAdsLead };
