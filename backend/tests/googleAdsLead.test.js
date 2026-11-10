const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapGoogleAdsLead } = require('../services/googleAdsLead');

test('google ads lead form maps official column ids', () => {
  const lead = mapGoogleAdsLead({
    lead_id: 'lead-1',
    form_id: 99,
    campaign_id: 55,
    google_key: 'secret',
    is_test: true,
    gcl_id: 'gclid',
    user_column_data: [
      { column_id: 'FULL_NAME', string_value: 'Anil Sharma' },
      { column_id: 'PHONE_NUMBER', string_value: '+91 99999 00000' },
      { column_id: 'EMAIL', string_value: 'anil@example.com' },
    ],
  });
  assert.equal(lead.name, 'Anil Sharma');
  assert.equal(lead.phone, '+919999900000');
  assert.equal(lead.email, 'anil@example.com');
  assert.equal(lead.isTest, true);
  assert.equal(lead.formId, '99');
});
