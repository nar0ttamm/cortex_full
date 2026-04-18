const config = require('../config');

/**
 * POST /voice/start-call on cortex_voice (same as manual "Start AI call" in CRM).
 */
async function requestVoiceStartCall({ tenant_id, lead_id, phone, name, inquiry }) {
  const base = (config.voiceServiceUrl || '').replace(/\/$/, '');
  if (!base) {
    const err = new Error('Voice service not configured');
    err.code = 'NO_VOICE_URL';
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(`${base}/voice/start-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': config.voiceSecret || '',
      },
      body: JSON.stringify({
        tenant_id,
        lead_id,
        phone,
        name,
        call_script: inquiry
          ? `Hello, I'm calling regarding your inquiry: "${inquiry}". Is this a good time to talk?`
          : undefined,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const e = new Error(body.error || `Voice service HTTP ${response.status}`);
      e.details = body;
      throw e;
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      const t = new Error('Voice service timeout');
      t.code = 'TIMEOUT';
      throw t;
    }
    throw err;
  }
}

module.exports = { requestVoiceStartCall };
