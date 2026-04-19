/**
 * FreeSWITCH mod_audio_fork → Node WebSocket (PCM16, typically mono@16000h).
 * Consumers register per call_id to feed Deepgram without coupling FS to the SDK.
 */

import type { Server as HttpServer } from 'http';
import { URL } from 'url';
import { WebSocketServer, type WebSocket } from 'ws';

const PCM16_MONO_16K_BPS = 16000 * 2;

const consumers = new Map<string, (buf: Buffer) => void>();
let warnedOpenIngress = false;
let warnedOptionalIngress = false;

/** When false, mod_audio_fork may omit ?token= on the WS URL; ingress must not be public. */
function ingressTokenRequired(): boolean {
  const requireToken = (process.env.AUDIO_INGRESS_REQUIRE_TOKEN ?? 'true').trim().toLowerCase();
  return !(requireToken === 'false' || requireToken === '0' || requireToken === 'no');
}

export function registerAudioConsumer(callId: string, onPcm: (buf: Buffer) => void): () => void {
  consumers.set(callId, onPcm);
  return () => {
    if (consumers.get(callId) === onPcm) consumers.delete(callId);
  };
}

function getIngressSecret(): string | undefined {
  if (!ingressTokenRequired()) return undefined;
  return (process.env.AUDIO_INGRESS_SECRET || process.env.VOICE_SECRET || '').trim() || undefined;
}

function parsePath(pathname: string): string | null {
  const m = pathname.match(/^\/audio-in\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function attachSession(callId: string, ws: WebSocket): void {
  let total = 0;
  let windowBytes = 0;
  const started = Date.now();
  const consumer = consumers.get(callId);
  const debug = process.env.VOICE_AUDIO_DEBUG === 'true' || !consumer;

  const tick = debug
    ? setInterval(() => {
        const bps = windowBytes;
        windowBytes = 0;
        const expected = PCM16_MONO_16K_BPS;
        const pct = expected ? Math.min(100, Math.round((bps / expected) * 100)) : 0;
        console.log(
          `[audio-in:${callId}] last 1s: ${bps} bytes (~${pct}% of nominal ${expected} B/s @ 16k mono PCM16)`
        );
      }, 1000)
    : null;

  ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const buf = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);
    if (!isBinary && buf.length < 512) {
      try {
        const t = buf.toString('utf8');
        if (t.trim()) console.log(`[audio-in:${callId}] text frame: ${t.slice(0, 200)}`);
      } catch (_) {}
      return;
    }
    total += buf.length;
    windowBytes += buf.length;
    const fn = consumers.get(callId);
    if (fn) fn(buf);
  });

  ws.on('close', (code, reason) => {
    if (tick) clearInterval(tick);
    const sec = (Date.now() - started) / 1000;
    console.log(
      `[audio-in:${callId}] closed code=${code} reason=${reason.toString()} total_bytes=${total} duration_s=${sec.toFixed(1)}`
    );
  });

  ws.on('error', err => {
    console.error(`[audio-in:${callId}] socket error:`, err.message);
  });

  console.log(
    `[audio-in:${callId}] connected${consumer ? ' (consumer attached)' : ' (no consumer — debug stats only)'}`
  );
}

export function attachAudioIngressWss(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host || '127.0.0.1';
    let pathname: string;
    let searchParams: URLSearchParams;
    try {
      const u = new URL(req.url || '/', `http://${host}`);
      pathname = u.pathname;
      searchParams = u.searchParams;
    } catch {
      socket.destroy();
      return;
    }

    const callId = parsePath(pathname);
    if (!callId) {
      socket.destroy();
      return;
    }

    const secret = getIngressSecret();
    const token = (searchParams.get('token') || '').trim();
    if (secret && token !== secret) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (ingressTokenRequired()) {
      if (!secret && !warnedOpenIngress) {
        warnedOpenIngress = true;
        console.warn('[audio-in] AUDIO_INGRESS_SECRET and VOICE_SECRET are empty — ingress is open (dev only)');
      }
    } else if (!warnedOptionalIngress) {
      warnedOptionalIngress = true;
      console.warn(
        '[audio-in] AUDIO_INGRESS_REQUIRE_TOKEN=false — WS ingress accepts connections without ?token= (mod_audio_fork compatibility). Do not expose TCP 5000 publicly while token checks are off.'
      );
    }

    wss.handleUpgrade(req, socket, head, ws => {
      attachSession(callId, ws);
    });
  });
}

export function defaultAudioIngressWsBase(): string {
  const explicit = (process.env.AUDIO_INGRESS_WS_BASE || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const port = Number(process.env.PORT) || 5000;
  return `ws://127.0.0.1:${port}`;
}

export function buildAudioIngressUrl(callId: string): string {
  const base = defaultAudioIngressWsBase();
  const secret = getIngressSecret();
  const path = `/audio-in/${encodeURIComponent(callId)}`;
  if (!secret) return `${base}${path}`;
  return `${base}${path}?token=${encodeURIComponent(secret)}`;
}
