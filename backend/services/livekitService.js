/**
 * LiveKit Service — routes call-start requests through the VM voice service.
 * The VM's cortex_voice exposes /voice/start-call which internally uses LiveKit
 * when LIVEKIT_* env vars are present on the VM.
 * This keeps port 7880 (LiveKit) behind the VM's firewall — no GCP rule changes needed.
 */

const VOICE_SERVICE_URL = (process.env.VOICE_SERVICE_URL || '').replace(/\/$/, '');
const VOICE_SECRET = process.env.VOICE_SECRET || '';

/**
 * Initiate an outbound AI call via the VM voice service.
 * The VM decides whether to use LiveKit or FreeSWITCH based on its env config.
 */
async function startLivekitCall({ callId, phone, name, inquiry, leadId, tenantId }) {
  if (!VOICE_SERVICE_URL) {
    throw new Error('VOICE_SERVICE_URL not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch(`${VOICE_SERVICE_URL}/voice/start-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': VOICE_SECRET,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        lead_id: leadId,
        phone,
        name,
        call_script: inquiry || undefined,
        _requested_call_id: callId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `Voice service HTTP ${res.status}`);
    }

    const data = await res.json();
    return { roomName: `call-${data.call_id || callId}`, callId: data.call_id || callId };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

module.exports = { startLivekitCall };
