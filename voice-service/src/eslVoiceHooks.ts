/**
 * Subscribe to FreeSWITCH ESL events on the shared inbound connection.
 */

import { getEslConnectionUnsafe } from './eslClient';
import { freeswitchBridge } from './freeswitchBridge';

let started = false;
let eslRetryTimer: ReturnType<typeof setTimeout> | null = null;

const ESL_RETRY_MS = Math.max(2000, parseInt(process.env.VOICE_ESL_RETRY_MS || '5000', 10));
const ESL_RETRY_MAX = Math.max(1, parseInt(process.env.VOICE_ESL_RETRY_MAX || '60', 10));

function wireEslEvents(conn: Awaited<ReturnType<typeof getEslConnectionUnsafe>>): void {
  conn.events('json', 'CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE', () => {});

  // modesl event payloads — use `any` (library has no stable types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn.on('esl::event::CHANNEL_ANSWER::*', (evt: any) => {
    const uuid = evt.getHeader?.('Unique-ID');
    if (uuid) freeswitchBridge.onChannelAnswer(uuid);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', (evt: any) => {
    const uuid = evt.getHeader?.('Unique-ID');
    if (uuid) freeswitchBridge.onChannelHangupComplete(uuid, evt);
  });
}

async function tryInitEslVoiceHooks(attempt: number): Promise<void> {
  if (started) return;
  if (process.env.VOICE_ESL_EVENTS === 'false') {
    console.log('[eslVoiceHooks] VOICE_ESL_EVENTS=false — skipping ESL event subscription');
    return;
  }

  try {
    const conn = await getEslConnectionUnsafe();
    started = true;
    if (eslRetryTimer) {
      clearTimeout(eslRetryTimer);
      eslRetryTimer = null;
    }

    wireEslEvents(conn);

    console.log('[eslVoiceHooks] Subscribed: CHANNEL_ANSWER, CHANNEL_HANGUP_COMPLETE');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt >= ESL_RETRY_MAX) {
      console.warn(`[eslVoiceHooks] ESL not available after ${ESL_RETRY_MAX} attempts:`, msg);
      return;
    }
    console.warn(
      `[eslVoiceHooks] ESL connect failed (attempt ${attempt}/${ESL_RETRY_MAX}), retry in ${ESL_RETRY_MS}ms:`,
      msg
    );
    eslRetryTimer = setTimeout(() => {
      void tryInitEslVoiceHooks(attempt + 1);
    }, ESL_RETRY_MS);
  }
}

export async function initEslVoiceHooks(): Promise<void> {
  if (started) return;
  await tryInitEslVoiceHooks(1);
}

/**
 * Call when the inbound ESL TCP connection drops (e.g. FreeSWITCH Docker restart).
 * Otherwise `started` stays true and CHANNEL_* handlers are never attached to the new socket — calls stay silent.
 */
export function resetEslHooksAfterDisconnect(): void {
  console.warn('[eslVoiceHooks] ESL disconnected — re-subscribing CHANNEL_ANSWER / CHANNEL_HANGUP_COMPLETE');
  started = false;
  if (eslRetryTimer) {
    clearTimeout(eslRetryTimer);
    eslRetryTimer = null;
  }
  void tryInitEslVoiceHooks(1);
}
