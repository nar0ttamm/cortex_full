import { Request, Response } from 'express';
import { freeswitchBridge } from './freeswitchBridge';
import { callStorage } from './callStorage';
import { notifyBackendCallResult } from './backendNotify';
import { buildAudioIngressUrl } from './audioIngressServer';
import { uuidAudioForkStart, uuidAudioForkStop } from './eslClient';
import { v4 as uuidv4 } from 'uuid';

function requireVoiceSecret(req: Request, res: Response): boolean {
  const secret = process.env.VOICE_SECRET;
  if (!secret) return true;
  const h = req.headers['x-voice-secret'];
  if (h !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export const callController = {
  /**
   * POST /voice/start-call
   * Called by the backend to initiate an outbound AI call.
   * Body: { tenant_id, lead_id, phone, name, call_script? }
   */
  async startCall(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;

    const { tenant_id, lead_id, phone, name, call_script } = req.body;

    if (!tenant_id || !lead_id || !phone) {
      return res.status(400).json({ error: 'Missing required fields: tenant_id, lead_id, phone' });
    }

    const callId = uuidv4();

    try {
      await callStorage.createCall({
        id: callId,
        tenant_id,
        lead_id,
        phone,
        status: 'initiating',
      });
    } catch (err: any) {
      console.error('[callController.startCall]', err.message);
      return res.status(500).json({ error: 'Failed to initiate call', details: err.message });
    }

    // Respond immediately so Vercel/backend does not wait for ESL dial (often 10–30s+).
    // originateCall sets ringing / failed in the background.
    res.json({ status: 'initiated', call_id: callId });

    void freeswitchBridge
      .originateCall({
        callId,
        phone,
        name: name || 'Customer',
        callScript: call_script,
        tenant_id,
        lead_id,
      })
      .catch(async (err: any) => {
        console.error('[callController.startCall:bg]', err.message);
        try {
          await callStorage.updateCallStatus(callId, 'failed', err.message);
        } catch (_) {}
        await notifyBackendCallResult({
          tenant_id,
          lead_id,
          call_id: callId,
          outcome: 'dial_failed',
          summary: err.message || 'Originate failed',
          transcript: '',
          duration_seconds: 0,
        });
      });
  },

  /**
   * POST /voice/end-call
   * Force-terminate a call in progress.
   * Body: { call_id }
   */
  async endCall(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;

    const { call_id } = req.body;
    if (!call_id) return res.status(400).json({ error: 'Missing call_id' });

    try {
      await freeswitchBridge.hangupCall(call_id);
      await callStorage.updateCallStatus(call_id, 'ended');
      return res.json({ status: 'ended', call_id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },

  /**
   * POST /voice/call-result
   * Called internally when a call session completes.
   * Used by freeswitchBridge after conversation finishes.
   * Body: { call_id, transcript, summary, duration_seconds, outcome }
   */
  /**
   * POST /voice/audio-fork/start
   * VM-only: tell FreeSWITCH to fork PCM to this service’s WebSocket (Step 1 validation).
   * Body: { call_id, mix?: string } — call_id must be the live channel UUID (same as origination_uuid).
   */
  async startAudioFork(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;

    const { call_id, mix } = req.body;
    if (!call_id || typeof call_id !== 'string') {
      return res.status(400).json({ error: 'Missing call_id (FreeSWITCH channel UUID)' });
    }

    try {
      const wsUrl = buildAudioIngressUrl(call_id);
      const body = await uuidAudioForkStart({
        callUuid: call_id,
        wsUrl,
        mix: typeof mix === 'string' ? mix : undefined,
      });
      return res.json({ status: 'ok', esl: body, ws_url_hint: wsUrl.replace(/token=[^&]+/, 'token=***') });
    } catch (err: any) {
      console.error('[callController.startAudioFork]', err.message);
      return res.status(500).json({ error: err.message || 'uuid_audio_fork failed' });
    }
  },

  /**
   * POST /voice/audio-fork/stop
   * Body: { call_id }
   */
  async stopAudioFork(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;

    const { call_id } = req.body;
    if (!call_id || typeof call_id !== 'string') {
      return res.status(400).json({ error: 'Missing call_id' });
    }

    try {
      const body = await uuidAudioForkStop(call_id);
      return res.json({ status: 'ok', esl: body });
    } catch (err: any) {
      console.error('[callController.stopAudioFork]', err.message);
      return res.status(500).json({ error: err.message || 'uuid_audio_fork stop failed' });
    }
  },

  async callResult(req: Request, res: Response) {
    if (!requireVoiceSecret(req, res)) return;

    const { call_id, transcript, summary, duration_seconds, outcome } = req.body;
    if (!call_id) return res.status(400).json({ error: 'Missing call_id' });

    try {
      await callStorage.saveCallResult({
        call_id,
        transcript: transcript || '',
        summary: summary || '',
        duration_seconds: duration_seconds || 0,
        outcome: outcome || 'unknown',
      });

      // Notify the main backend to update the lead
      const call = await callStorage.getCall(call_id);
      if (call) {
        await notifyBackendCallResult({
          tenant_id: call.tenant_id,
          lead_id: call.lead_id,
          call_id,
          transcript,
          summary,
          duration_seconds,
          outcome: outcome || 'unknown',
        });
      }

      return res.json({ status: 'saved', call_id });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  },
};
