import { EventEmitter } from 'events';
import { speechRecognition } from './speechRecognition';
import { conversationEngine } from './conversationEngine';
import { voiceSynthesis } from './voiceSynthesis';
import { callStorage } from './callStorage';
import { originatePark, uuidKill } from './eslClient';
import { normalizeToE164 } from './phoneE164';
import { beginEslCallPipeline, stopEslCallPipeline } from './callMediaPipeline';
import { notifyBackendCallResult } from './backendNotify';

/**
 * FreeSWITCH ESL bridge: outbound calls via Telnyx; on answer, realtime STT → Gemini → TTS → broadcast.
 */

interface OriginateOptions {
  callId: string;
  phone: string;
  name: string;
  callScript?: string;
  tenant_id: string;
  lead_id: string;
}

function useEslOriginate(): boolean {
  return process.env.USE_ESL_ORIGINATE !== 'false';
}

function sipGatewayName(): string {
  return (process.env.SIP_GATEWAY_NAME || 'telnyx').trim();
}

function sipCallerIdE164(): string {
  const id = (process.env.SIP_CALLER_ID_E164 || '').trim();
  return id.startsWith('+') ? id : id ? `+${id.replace(/\D/g, '')}` : '';
}

class FreeswitchBridge extends EventEmitter {
  private activeCalls: Map<string, any>;

  constructor() {
    super();
    this.activeCalls = new Map();
  }

  async originateCall(opts: OriginateOptions): Promise<void> {
    const { callId, phone, name, callScript, tenant_id, lead_id } = opts;

    console.log(`[FreeSWITCH] Originating call ${callId} to ${phone}`);

    if (useEslOriginate()) {
      const dest = normalizeToE164(phone);
      if (!dest) {
        throw new Error('Invalid destination phone; could not normalize to E.164');
      }

      const callerId = sipCallerIdE164();
      if (!callerId) {
        throw new Error('SIP_CALLER_ID_E164 is not set (your Telnyx DID in E.164, e.g. +14355009976)');
      }

      const gw = sipGatewayName();
      const fsReply = await originatePark({
        callUuid: callId,
        destinationE164: dest,
        callerIdE164: callerId,
        gatewayName: gw,
      });

      console.log(`[FreeSWITCH] ESL originate OK: ${fsReply}`);
      await callStorage.updateCallStatus(callId, 'ringing');
      this.activeCalls.set(callId, {
        phone: dest,
        name,
        callScript,
        tenant_id,
        lead_id,
        startTime: Date.now(),
        esl: true,
        pipelineStarted: false,
      });
      return;
    }

    // Simulated mode (no FreeSWITCH dial): runs stub AI pipeline for local dev only
    this.activeCalls.set(callId, {
      phone,
      name,
      callScript,
      tenant_id,
      lead_id,
      startTime: Date.now(),
      conversationHistory: [],
      esl: false,
    });

    this._startConversationPipeline(callId).catch(err => {
      console.error(`[FreeSWITCH] Pipeline error for ${callId}:`, err.message);
      this.activeCalls.delete(callId);
    });
  }

  async hangupCall(callId: string): Promise<void> {
    console.log(`[FreeSWITCH] Hanging up call ${callId}`);
    const ctx = this.activeCalls.get(callId);

    await stopEslCallPipeline(callId, 'ended_by_api').catch(() => {});

    if (useEslOriginate() && ctx?.esl) {
      try {
        await uuidKill(callId);
      } catch (e: any) {
        console.warn(`[FreeSWITCH] uuid_kill ${callId}:`, e?.message || e);
      }
    }

    this.activeCalls.delete(callId);
  }

  /** ESL CHANNEL_ANSWER — start realtime pipeline when leg matches an outbound call we originated. */
  onChannelAnswer(uuid: string): void {
    const ctx = this.activeCalls.get(uuid);
    if (!ctx?.esl || ctx.pipelineStarted) return;
    ctx.pipelineStarted = true;
    void beginEslCallPipeline(uuid, {
      tenant_id: ctx.tenant_id,
      lead_id: ctx.lead_id,
      phone: ctx.phone,
      name: ctx.name,
      callScript: ctx.callScript,
      startedAt: ctx.startTime,
    }).catch((err: Error) => {
      console.error(`[FreeSWITCH] pipeline start ${uuid}:`, err.message);
      ctx.pipelineStarted = false;
    });
  }

  /** ESL CHANNEL_HANGUP_COMPLETE — persist + notify; channel is already gone. */
  onChannelHangupComplete(uuid: string): void {
    const ctx = this.activeCalls.get(uuid);
    void (async () => {
      await stopEslCallPipeline(uuid, ctx ? 'remote_hangup' : 'hangup').catch(() => {});
      if (ctx?.esl && !ctx.pipelineStarted) {
        const sec = Math.max(0, Math.floor((Date.now() - ctx.startTime) / 1000));
        try {
          await callStorage.updateCallStatus(uuid, 'completed');
          await callStorage.saveCallResult({
            call_id: uuid,
            transcript: '',
            summary: 'Call ended before AI session started',
            duration_seconds: sec,
            outcome: sec < 5 ? 'no_answer' : 'unknown',
          });
          await notifyBackendCallResult({
            tenant_id: ctx.tenant_id,
            lead_id: ctx.lead_id,
            call_id: uuid,
            outcome: sec < 5 ? 'no_answer' : 'unknown',
            summary: 'Call ended before AI session started',
            transcript: '',
            duration_seconds: sec,
          });
        } catch (e: unknown) {
          console.warn(`[FreeSWITCH] missed-call persist ${uuid}:`, e instanceof Error ? e.message : e);
        }
      }
      this.activeCalls.delete(uuid);
    })();
  }

  private async _startConversationPipeline(callId: string): Promise<void> {
    const callCtx = this.activeCalls.get(callId);
    if (!callCtx) return;

    await callStorage.updateCallStatus(callId, 'active');

    const greeting =
      callCtx.callScript ||
      `Hello, this is an AI assistant from CortexFlow. Am I speaking with ${callCtx.name}?`;

    const greetingAudio = await voiceSynthesis.synthesize(greeting);
    await this._sendAudioToCall(callId, greetingAudio);

    callCtx.conversationHistory.push({ role: 'assistant', content: greeting });

    const sttStream = speechRecognition.createStreamingSession({
      onTranscript: async (text: string, isFinal: boolean) => {
        if (!isFinal) return;

        console.log(`[Pipeline:${callId}] User said: "${text}"`);
        callCtx.conversationHistory.push({ role: 'user', content: text });

        let responseText = '';
        await conversationEngine.streamResponse(
          callCtx.conversationHistory,
          async (chunk: string) => {
            responseText += chunk;
            const audioChunk = await voiceSynthesis.synthesize(chunk);
            await this._sendAudioToCall(callId, audioChunk);
          }
        );

        callCtx.conversationHistory.push({ role: 'assistant', content: responseText });

        if (conversationEngine.shouldEndCall(responseText)) {
          setTimeout(() => this._endConversation(callId), 2000);
        }
      },
      onError: (err: Error) => {
        console.error(`[Pipeline:${callId}] STT error:`, err.message);
      },
    });

    callCtx.sttStream = sttStream;
  }

  private async _sendAudioToCall(_callId: string, _audioBuffer: Buffer): Promise<void> {
    // RTP/TTS playback wired in a later phase
  }

  private async _endConversation(callId: string): Promise<void> {
    const callCtx = this.activeCalls.get(callId);
    if (!callCtx) return;

    const durationSeconds = Math.floor((Date.now() - callCtx.startTime) / 1000);
    const fullTranscript = callCtx.conversationHistory
      .map((m: any) => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
      .join('\n');

    const summary = await conversationEngine.summarizeCall(callCtx.conversationHistory);

    await callStorage.saveCallResult({
      call_id: callId,
      transcript: fullTranscript,
      summary: summary.text,
      duration_seconds: durationSeconds,
      outcome: summary.outcome,
    });

    await this.hangupCall(callId);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.VOICE_SECRET) headers['x-voice-secret'] = process.env.VOICE_SECRET;

      await fetch(`http://localhost:${process.env.PORT || 5000}/voice/call-result`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          call_id: callId,
          transcript: fullTranscript,
          summary: summary.text,
          duration_seconds: durationSeconds,
          outcome: summary.outcome,
        }),
      });
    } catch (_) {}
  }
}

export const freeswitchBridge = new FreeswitchBridge();
