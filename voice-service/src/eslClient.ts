/**
 * FreeSWITCH inbound ESL — api/bgapi to control calls (same host as FS).
 * Uses modesl (CommonJS); loaded via require for compatibility.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const esl = require('modesl') as {
  Connection: new (host: string, port: number, password: string, cb?: () => void) => EslConnection;
};

interface EslConnection {
  connected(): boolean;
  on(event: string, cb: (err?: Error) => void): void;
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

    conn.on('error', (err?: Error) => {
      done(() => {
        connection = null;
        reject(err || new Error('ESL socket error'));
      });
    });

    conn.on('esl::end', () => {
      connection = null;
      pendingConnect = null;
    });
  });

  return pendingConnect;
}

/**
 * originate {vars}sofia/gateway/<gateway>/<e164> &park()
 */
export async function originatePark(params: {
  callUuid: string;
  destinationE164: string;
  callerIdE164: string;
  gatewayName: string;
}): Promise<string> {
  const { callUuid, destinationE164, callerIdE164, gatewayName } = params;
  const dial = `sofia/gateway/${gatewayName}/${destinationE164}`;
  const vars = `{origination_uuid=${callUuid},origination_caller_id_number=${callerIdE164}}`;
  const arg = `${vars}${dial} &park()`;

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

/**
 * Stream call audio to a WebSocket URL (requires mod_audio_fork loaded in FreeSWITCH).
 * @param mix e.g. mono@16000h for PCM16 mono 16 kHz (good for Deepgram / Phase D)
 */
export async function uuidAudioForkStart(params: {
  callUuid: string;
  wsUrl: string;
  mix?: string;
}): Promise<string> {
  const { callUuid, wsUrl } = params;
  const mix = (params.mix || 'mono@16000h').trim();
  const arg = `${callUuid} start ${wsUrl} ${mix}`;
  const conn = await getEslConnection();

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_audio_fork timeout')), ESL_API_MS);
    conn.api('uuid_audio_fork', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

export async function uuidAudioForkStop(callUuid: string): Promise<string> {
  const arg = `${callUuid} stop`;
  const conn = await getEslConnection();
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

/** Play a WAV file to the call leg (requires path visible to FreeSWITCH). */
export async function uuidBroadcast(callUuid: string, wavPath: string, leg: 'aleg' | 'bleg' | 'both' = 'aleg'): Promise<string> {
  const arg = `${callUuid} ${wavPath} ${leg}`;
  const conn = await getEslConnection();
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

/** Stop in-progress playback / break out of media (barge-in). */
export async function uuidBreak(callUuid: string, scope: 'all' | 'media' = 'all'): Promise<string> {
  const arg = `${callUuid} ${scope}`;
  const conn = await getEslConnection();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ESL uuid_break timeout')), ESL_API_MS);
    conn.api('uuid_break', arg, (evt: EslEvent) => {
      clearTimeout(t);
      const body = (evt.getBody() || '').trim();
      if (body.startsWith('-ERR')) reject(new Error(body));
      else resolve(body);
    });
  });
}

/**
 * Raw modesl connection for event subscription (CHANNEL_ANSWER, etc.).
 * Same singleton as api() — do not disconnect from here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEslConnectionUnsafe(): Promise<any> {
  return getEslConnection();
}
