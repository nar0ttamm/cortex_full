/**
 * Agent Tool Proxy — V3 Calling Stack
 *
 * The Python agent (running on GCP VM) cannot directly call the Vercel backend.
 * Instead it calls /voice/tools/* on this local service (port 5000).
 * This proxy forwards the request to the Vercel backend with proper auth.
 *
 * Security:
 * - Incoming requests from agent must have x-voice-secret header
 * - Outbound requests to backend also include x-voice-secret
 */

import { Request, Response } from 'express';

const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const VOICE_SECRET = process.env.VOICE_SECRET || '';
const PROXY_TIMEOUT_MS = 10_000;

function requireVoiceSecret(req: Request, res: Response): boolean {
  if (!VOICE_SECRET) return true;
  const h = req.headers['x-voice-secret'];
  if (h !== VOICE_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

async function forwardToBackend(path: string, body: object): Promise<{ ok: boolean; data: any }> {
  if (!BACKEND_URL) {
    console.warn(`[agentToolProxy] BACKEND_URL not set — cannot forward ${path}`);
    return { ok: false, data: { error: 'BACKEND_URL not configured' } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(`${BACKEND_URL}/v1/calls/tools/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-voice-secret': VOICE_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (err: any) {
    clearTimeout(timeout);
    console.error(`[agentToolProxy] ${path} error:`, err.message);
    return { ok: false, data: { error: err.message } };
  }
}

export const agentToolProxy = {
  /** POST /voice/tools/search-products → /v1/calls/tools/search-products */
  async searchProducts(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;
    const { ok, data } = await forwardToBackend('search-products', req.body);
    return res.status(ok ? 200 : 502).json(data);
  },

  /** POST /voice/tools/update-lead-memory → /v1/calls/tools/update-lead-memory */
  async updateLeadMemory(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;
    const { ok, data } = await forwardToBackend('update-lead-memory', req.body);
    return res.status(ok ? 200 : 502).json(data);
  },

  /** POST /voice/tools/log-analytics → /v1/calls/tools/log-analytics */
  async logAnalytics(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;
    const { ok, data } = await forwardToBackend('log-analytics', req.body);
    return res.status(ok ? 200 : 502).json(data);
  },
};
