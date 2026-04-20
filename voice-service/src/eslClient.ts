/**
 * FreeSWITCH inbound ESL — api/bgapi to control calls (same host as FS).
 * Uses modesl (CommonJS); loaded via require for compatibility.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const esl = require('modesl') as {
  Connection: new (host: string, port: number, password: string, cb?: () => void) => EslConnection;
};

/** modesl `Connection` — typed loosely for `events` / ESL event payloads. */
interface EslConnection {
  connected(): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, cb: (...args: any[]) => void): void;
  events(format: string, events: string, cb: () => void): void;
  api(command: string, args: string, cb: (evt: EslEvent) => void): void;
  api(command: string, cb: (evt: EslEvent) => void): void;
}

interface EslEvent {
  getBody(): string;
}

let connection: EslConnection | null = null;
let pendingConnect: Promise<EslConnection> | null = null;

function getEnvConnection(): { host: string; port: number; password: string } {
  return {
    host: process.env.FREESWITCH_HOST || '127.0.0.1',
    port: parseInt(process.env.FREESWITCH_ESL_PORT || '8021', 10),
    password: process.env.FREESWITCH_ESL_PASSWORD || 'ClueCon',
  };
}

const ESL_CONNECT_MS = parseInt(process.env.ESL_CONNECT_TIMEOUT_MS || '8000', 10);
const ESL_API_MS = parseInt(process.env.ESL_API_TIMEOUT_MS || '15000', 10);

export async function getEslConnection(): Promise<EslConnection> {
  if (connection && connection.connected()) return connection;
  if (pendingConnect) return pendingConnect;

  const { host, port, password } = getEnvConnection();

  pendingConnect = new Promise<EslConnection>((resolve, reject) => {
    let settled = false;
    let conn: EslConnection;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingConnect = null;
      fn();
    };

    const timer = setTimeout(() => {
      done(() => {
        connection = null;
        try {
          (conn as unknown as { disconnect?: () => void }).disconnect?.();
        } catch (_) {}
        reject(
          new Error(
            `ESL connect timeout after ${ESL_CONNECT_MS}ms — check FREESWITCH_ESL_HOST/PORT/PASSWORD (must match Docker ESL_PASSWORD) and that FreeSWITCH is running`
          )
        );
      });
    }, ESL_CONNECT_MS);

    conn = new esl.Connection(host, port, password, () => {
      done(() => {
        connection = conn;
        resolve(conn);
      });
    });

    conn.on('esl::event::auth::fail', () => {
      done(() => {
        connection = null;
        reject(new Error('ESL authentication failed — FREESWITCH_ESL_PASSWORD does not match FreeSWITCH event_socket.conf.xml / Docker ESL_PASSWORD'));
      });
    });

    conn.on('error', (err: Error) => {
      done(() => {
        connection = null;
        reject(err || new Error('ESL socket error'));
      });
    });

    conn.on('esl::end', () => {
      connection = null;
      pendingConnect = null;
      void import('./eslVoiceHooks').then(m => m.resetEslHooksAfterDisconnect());
    });
  });

  return pendingConnect;
}

/** Alias for subscribers that need the shared ESL socket (e.g. `eslVoiceHooks`). */
export const getEslConnectionUnsafe = getEslConnection;

/**
 * Build sofia dial string. Default: `sofia/gateway/<name>/<e164>` (matches `sofia status gateway` name, e.g. `telnyx`).
 * Override with `SIP_OUTBOUND_DIAL_TEMPLATE` — placeholders: `{gateway}`, `{destination}`, `{caller}`, `{uuid}`.
 */
export function buildOutboundDialString(params: {
  destinationE164: string;
  gatewayName: string;
  callerIdE164: string;
  callUuid: string;
}): string {
  const gateway = params.gatewayName.trim();
  const destination = params.destinationE164.trim();
  const template = (process.env.SIP_OUTBOUND_DIAL_TEMPLATE || 'sofia/gateway/{gateway}/{destination}').trim();
  return template
    .replace(/\{gateway\}/g, gateway)
    .replace(/\{destination\}/g, destination)
    .replace(/\{caller\}/g, params.callerIdE164.trim())
    .replace(/\{uuid\}/g, params.callUuid);
}

/**
 * originate {vars}<sofia dial> &park()
 */
export async function originatePark(params: {
  callUuid: string;
  destinationE164: string;
  callerIdE164: string;
  gatewayName: string;
}): Promise<string> {
  const { callUuid, destinationE164, callerIdE164, gatewayName } = params;
  const dial = buildOutboundDialString({
    callUuid,
    destinationE164,
    callerIdE164,
    gatewayName,
  });
  const vars = `{origination_uuid=${callUuid},origination_caller_id_number=${callerIdE164}}`;
  const arg = `${vars}${dial} &park()`;

  if (process.env.VOICE_LOG_ORIGINATE === 'true') {
    console.log('[eslClient] originate dial:', dial);
  }

  const conn = await getEslConnection();

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`ESL api originate timeout after ${ESL_API_MS}ms`));
    }, ESL_API_MS);

    conn.api('originate', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) {
        reject(new Error(body));
        return;
      }
      if (body.startsWith('+OK')) {
        resolve(body);
        return;
      }
      resolve(body);
    });
  });
}

export async function uuidKill(callUuid: string): Promise<string> {
  const conn = await getEslConnection();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_kill timeout')), ESL_API_MS);
    conn.api('uuid_kill', callUuid, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

/** Play WAV file to call leg (`aleg` = customer on outbound). */
export async function uuidBroadcast(
  callUuid: string,
  filePath: string,
  leg: 'aleg' | 'bleg' | 'both' = 'aleg'
): Promise<string> {
  const conn = await getEslConnection();
  const arg = `${callUuid} ${filePath} ${leg}`;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_broadcast timeout')), ESL_API_MS);
    conn.api('uuid_broadcast', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

/** Stop current playback on the channel (used for barge-in). */
export async function uuidBreak(callUuid: string): Promise<string> {
  const conn = await getEslConnection();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_break timeout')), ESL_API_MS);
    conn.api('uuid_break', callUuid, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

/**
 * Stream call audio to Node via WebSocket (`mod_audio_fork`).
 * drachtio README: `uuid_audio_fork <uuid> start <url> <mix-type> <sampling-rate> [metadata]`
 * e.g. mix arg tail: `mono 16k` — see `AUDIO_FORK_MIX` in callMediaPipeline.
 * ESL: unquoted `?token=` can break parsing; wrap URL in double quotes when it contains ? or &.
 */
function quoteWsUrlForEsl(wsUrl: string): string {
  if (!/[?&]/.test(wsUrl)) return wsUrl;
  return `"${wsUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function uuidAudioForkStart(params: {
  callUuid: string;
  wsUrl: string;
  mix: string;
}): Promise<string> {
  const { callUuid, wsUrl, mix } = params;
  const conn = await getEslConnection();
  const arg = `${callUuid} start ${quoteWsUrlForEsl(wsUrl)} ${mix}`;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_audio_fork start timeout')), ESL_API_MS);
    conn.api('uuid_audio_fork', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

export async function uuidAudioForkStop(callUuid: string): Promise<string> {
  const conn = await getEslConnection();
  const arg = `${callUuid} stop`;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_audio_fork stop timeout')), ESL_API_MS);
    conn.api('uuid_audio_fork', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}
