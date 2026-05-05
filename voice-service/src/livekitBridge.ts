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

/**
 * Each LiveKit service requires different JWT grants:
 *   RoomService/CreateRoom          → video.roomCreate + video.roomAdmin
 *   AgentDispatchService/CreateDispatch → video.roomAdmin + video.room (scoped to the room)
 *   SIPService/CreateSIPParticipant → sip.admin
 */
function makeLivekitToken(opts: { room?: string; sipCall?: boolean } = {}): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

  // Video grants: always include roomCreate+roomAdmin; scope to room when provided
  const video: Record<string, unknown> = { roomCreate: true, roomAdmin: true, roomList: true };
  if (opts.room) video.room = opts.room;

  const claims: Record<string, unknown> = {
    exp: Math.floor(Date.now() / 1000) + 600,
    iss: LK_KEY,
    sub: LK_KEY,
    video,
  };
  // SIP participant creation needs sip.call (per livekit-api SDK SIPGrants)
  if (opts.sipCall) claims.sip = { call: true };

  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = b64url(createHmac('sha256', LK_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

// ── LiveKit Twirp API calls ─────────────────────────────────────────────────

async function lkCall(
  service: string,
  method: string,
  body: object,
  token: string = makeLivekitToken(),
): Promise<any> {
  const url = `${LK_HTTP_URL}/twirp/livekit.${service}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
  tenantName?: string;
  kbContext?: Record<string, unknown> | null;
  callBrief?: Record<string, unknown> | null;
}): Promise<void> {
  const { callId, phone, name, inquiry, leadId, tenantId, tenantName, kbContext, callBrief } = params;
  const roomName = `call-${callId}`;
  const metadata = JSON.stringify({
    call_id:     callId,
    lead_id:     leadId,
    tenant_id:   tenantId,
    tenant_name: tenantName || '',
    name,
    inquiry,
    // V3: prefer call_brief over kb_context; keep kb_context for backward compatibility
    call_brief:  callBrief || null,
    kb_context:  callBrief ? null : (kbContext || null),
  });

  // 1. Create the LiveKit room — generic admin token
  await lkCall('RoomService', 'CreateRoom', {
    name: roomName,
    metadata,
    empty_timeout: 120,
    max_participants: 5,
  });
  console.log(`[livekitBridge] room created: ${roomName}`);

  // 2. Dispatch the AI agent — room-scoped token required by AgentDispatchService
  await lkCall(
    'AgentDispatchService', 'CreateDispatch',
    { room: roomName, metadata, agent_name: 'cortex-agent' },
    makeLivekitToken({ room: roomName }),
  );
  console.log(`[livekitBridge] agent dispatched to ${roomName}`);

  // 3. Dial via SIP — service name is "SIP" (not "SIPService"); grant is sip.call
  await lkCall(
    'SIP', 'CreateSIPParticipant',
    {
      sip_trunk_id: LK_TRUNK,
      sip_call_to: phone,
      room_name: roomName,
      participant_identity: `sip-${callId}`,
      participant_name: name || 'Lead',
      play_dialtone: true,
    },
    makeLivekitToken({ room: roomName, sipCall: true }),
  );
  console.log(`[livekitBridge] SIP participant created for ${phone}`);
}
