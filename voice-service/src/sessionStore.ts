/**
 * Live call session state — Redis when REDIS_URL is set, else in-process Map.
 */

import type Redis from 'ioredis';

export type Speaker = 'user' | 'ai' | 'system';

export interface CallSessionState {
  call_id: string;
  tenant_id: string;
  lead_id: string;
  speaker: Speaker;
  transcript_tail: string;
  updated_at: number;
}

const memory = new Map<string, CallSessionState>();

let redisClient: Redis | null = null;
let redisInitFailed = false;

function keyFor(callId: string): string {
  return `cortexflow:call:${callId}`;
}

async function getRedis(): Promise<Redis | null> {
  const url = (process.env.REDIS_URL || '').trim();
  if (!url || redisInitFailed) return null;
  if (redisClient) return redisClient;
  try {
    const IoRedis = (await import('ioredis')).default;
    redisClient = new IoRedis(url, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 5000,
    });
    redisClient.on('error', () => {});
    await redisClient.ping();
    return redisClient;
  } catch (e) {
    redisInitFailed = true;
    try {
      redisClient?.disconnect();
    } catch (_) {}
    redisClient = null;
    console.warn('[sessionStore] Redis unavailable, using in-memory fallback:', (e as Error).message);
    return null;
  }
}

export const sessionStore = {
  async merge(
    callId: string,
    partial: Partial<CallSessionState> & { tenant_id?: string; lead_id?: string }
  ): Promise<void> {
    const prev = memory.get(callId);
    const tenant_id = partial.tenant_id ?? prev?.tenant_id ?? '';
    const lead_id = partial.lead_id ?? prev?.lead_id ?? '';
    const next: CallSessionState = {
      call_id: callId,
      tenant_id,
      lead_id,
      speaker: partial.speaker ?? prev?.speaker ?? 'system',
      transcript_tail: partial.transcript_tail ?? prev?.transcript_tail ?? '',
      updated_at: Date.now(),
    };
    memory.set(callId, next);

    const r = await getRedis();
    if (!r) return;
    try {
      await r.set(keyFor(callId), JSON.stringify(next), 'EX', 86400);
    } catch (e) {
      console.warn('[sessionStore] redis set failed:', (e as Error).message);
    }
  },

  async delete(callId: string): Promise<void> {
    memory.delete(callId);
    const r = await getRedis();
    if (!r) return;
    try {
      await r.del(keyFor(callId));
    } catch (_) {}
  },
};
