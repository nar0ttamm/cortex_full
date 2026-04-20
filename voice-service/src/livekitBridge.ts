/**
 * LiveKit Bridge — creates rooms, dispatches the AI agent, and dials via SIP.
 * Uses only Node.js built-ins (crypto, fetch) — no additional npm packages.
 * LiveKit JWT spec: https://docs.livekit.io/home/get-started/authentication/
 */
import { createHmac } from 'crypto';

const LK_HTTP_URL = (process.env.LIVEKIT_URL || 'ws://localhost:7880')
  .replace(/^wss?:\/\//, (m) => (m === 'wss://' ? 'https://' : 'http://'));
const LK_KEY = process.env.LIVEKIT_API_KEY || '';
const LK_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LK_TRUNK = process.env.LIVEKIT_SIP_TRUNK_ID || '';

export const isLivekitConfigured = (): boolean =>
  Boolean(LK_HTTP_URL && LK_KEY && LK_SECRET && LK_TRUNK);

// ── JWT helper (HS256, no external dependency) ─────────────────────────────

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf;
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function makeLivekitToken(): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + 600,
      iss: LK_KEY,
      sub: LK_KEY,
      video: { roomCreate: true, roomAdmin: true, roomList: true },
    })
  );
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac('sha256', LK_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

// ── LiveKit Twirp API calls ─────────────────────────────────────────────────

async function lkCall(service: string, method: string, body: object): Promise<any> {
  const url = `${LK_HTTP_URL}/twirp/livekit.${service}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${makeLivekitToken()}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[livekitBridge] ${service}/${method} HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function startLivekitCall(params: {
  callId: string;
  phone: string;
  name: string;
  inquiry: string;
  leadId: string;
  tenantId: string;
}): Promise<void> {
  const { callId, phone, name, inquiry, leadId, tenantId } = params;
  const roomName = `call-${callId}`;
  const metadata = JSON.stringify({
    call_id: callId,
    lead_id: leadId,
    tenant_id: tenantId,
    name,
    inquiry,
  });

  // 1. Create the LiveKit room
  await lkCall('RoomService', 'CreateRoom', {
    name: roomName,
    metadata,
    empty_timeout: 120,
    max_participants: 5,
  });
  console.log(`[livekitBridge] room created: ${roomName}`);

  // 2. Dispatch the AI agent worker to the room
  await lkCall('AgentDispatchService', 'CreateDispatch', {
    room_name: roomName,
    metadata,
    agent_name: 'cortex-agent',
  });
  console.log(`[livekitBridge] agent dispatched to ${roomName}`);

  // 3. Create an outbound SIP participant (dials via Telnyx)
  await lkCall('SIPService', 'CreateSIPParticipant', {
    sip_trunk_id: LK_TRUNK,
    sip_call_to: phone,
    room_name: roomName,
    participant_identity: `sip-${callId}`,
    participant_name: name || 'Lead',
    play_dialtone: true,
  });
  console.log(`[livekitBridge] SIP participant created for ${phone}`);
}
