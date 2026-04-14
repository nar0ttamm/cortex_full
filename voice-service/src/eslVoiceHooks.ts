/**
 * Subscribe to FreeSWITCH ESL events on the shared inbound connection.
 */

import { getEslConnectionUnsafe } from './eslClient';
import { freeswitchBridge } from './freeswitchBridge';

let started = false;

export async function initEslVoiceHooks(): Promise<void> {
  if (started) return;
  if (process.env.VOICE_ESL_EVENTS === 'false') {
    console.log('[eslVoiceHooks] VOICE_ESL_EVENTS=false — skipping ESL event subscription');
    return;
  }

  try {
    const conn = await getEslConnectionUnsafe();
    started = true;

    conn.events('json', 'CHANNEL_ANSWER CHANNEL_HANGUP_COMPLETE', () => {});

    conn.on('esl::event::CHANNEL_ANSWER::*', (evt: { getHeader: (h: string) => string }) => {
      const uuid = evt.getHeader('Unique-ID');
      if (uuid) freeswitchBridge.onChannelAnswer(uuid);
    });

    conn.on('esl::event::CHANNEL_HANGUP_COMPLETE::*', (evt: { getHeader: (h: string) => string }) => {
      const uuid = evt.getHeader('Unique-ID');
      if (uuid) freeswitchBridge.onChannelHangupComplete(uuid);
    });

    console.log('[eslVoiceHooks] Subscribed: CHANNEL_ANSWER, CHANNEL_HANGUP_COMPLETE');
  } catch (e: unknown) {
    started = false;
    console.warn('[eslVoiceHooks] ESL not available (events disabled):', e instanceof Error ? e.message : e);
  }
}
