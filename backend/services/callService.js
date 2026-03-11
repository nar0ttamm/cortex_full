const { getCredentials } = require('./credentialService');
const config = require('../config');

/**
 * Initiate an outbound call via Exotel.
 * Credentials shape: { account_sid, api_key, api_token, virtual_number }
 */
async function startExotelCall({ tenantId, phone }) {
  const creds = await getCredentials(tenantId, 'exotel');
  const authHeader =
    'Basic ' + Buffer.from(`${creds.api_key}:${creds.api_token}`).toString('base64');

  const form = new URLSearchParams({
    From: creds.virtual_number,
    To: phone,
    CallerId: creds.virtual_number,
    Url: `${config.backendUrl}/v1/call/flow`,
    CallType: 'trans',
    StatusCallback: `${config.backendUrl}/v1/call/status`,
    Record: 'true',
    TimeLimit: '300',
  });

  const res = await fetch(
    `https://api.exotel.com/v1/Accounts/${creds.account_sid}/Calls/connect.json`,
    {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Exotel error: ${err.RestException?.Message || res.statusText}`);
  }

  return res.json();
}

/**
 * Generate TwiML XML for Exotel call flow.
 * Called when Exotel fetches instructions for an active call.
 */
function generateCallFlowXML({ leadName }) {
  const name = leadName || 'there';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-IN">Hello ${name}! This is an automated call from our team regarding your recent inquiry. Please speak after the beep and tell us your requirements. Our team will follow up with you shortly.</Say>
  <Record maxLength="120" playBeep="true" finishOnKey="#" />
  <Say voice="alice" language="en-IN">Thank you for your time. We will be in touch soon. Goodbye!</Say>
  <Hangup/>
</Response>`;
}

/**
 * Derive a human-readable call result from AI analysis.
 */
function getCallResult(analysis) {
  if (!analysis) return 'not_interested';
  if (analysis.confirmed_appointment) return 'confirmed';
  if (analysis.interested) return 'interested';
  if (analysis.needs_info) return 'callback_requested';
  return 'not_interested';
}

/**
 * Map a call result string to a lead status.
 */
function callResultToLeadStatus(callResult) {
  const map = {
    confirmed: 'interested',
    interested: 'interested',
    callback_requested: 'callback_scheduled',
    not_interested: 'not_interested',
  };
  return map[callResult] || 'contacted';
}

module.exports = { startExotelCall, generateCallFlowXML, getCallResult, callResultToLeadStatus };
