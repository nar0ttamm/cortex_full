import { EventEmitter } from 'events';
import { speechRecognition } from './speechRecognition';
import { conversationEngine } from './conversationEngine';
import { voiceSynthesis } from './voiceSynthesis';
import { callStorage } from './callStorage';
import { originatePark, uuidKill } from './eslClient';
import { normalizeToE164 } from './phoneE164';
import { beginEslCallPipeline, stopEslCallPipeline } from './callMediaPipeline';
import { mapEarlyHangupCause } from './sipHangupCause';
import { notifyBackendCallResult } from './backendNotify';

/**
 * FreeSWITCH ESL bridge: real outbound calls via Telnyx gateway when USE_ESL_ORIGINATE is enabled.
 * Full RTP ↔ STT/TTS pipeline is still TODO; with ESL enabled we only originate & park to avoid
 * burning Deepgram/OpenAI without real media.
 */

interface OriginateOptions {
  callId: string;
  tenant_id: string;
  lead_id: string;
  phone: string;
  name: string;
  callScript?: string;
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
    const { callId, tenant_id, lead_id, phone, name, callScript } = opts;

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
        tenant_id,
        lead_id,
        phone: dest,
        name,
        callScript,
        startTime: Date.now(),
        esl: true,
        answered: false,
      });
      return;
    }

    // Simulated mode (no FreeSWITCH dial): runs stub AI pipeline for local dev only
    this.activeCalls.set(callId, {
      tenant_id,
      lead_id,
      phone,
      name,
      callScript,
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

    if (useEslOriginate() && ctx?.esl) {
      try {
        await uuidKill(callId);
      } catch (e: any) {
        console.warn(`[FreeSWITCH] uuid_kill ${callId}:`, e?.message || e);
      }
    }

    this.activeCalls.delete(callId);
  }

  /** ESL `CHANNEL_ANSWER` — start realtime STT → LLM → TTS pipeline when `VOICE_REALTIME_PIPELINE` is enabled. */
  onChannelAnswer(callUuid: string): void {
    const ctx = this.activeCalls.get(callUuid);
    if (!ctx?.esl) return;
    ctx.answered = true;
    void beginEslCallPipeline(callUuid, {
      tenant_id: ctx.tenant_id,
      lead_id: ctx.lead_id,
      phone: ctx.phone,
      name: ctx.name,
      callScript: ctx.callScript,
      startedAt: ctx.startTime,
      answeredAt: Date.now(),
    }).catch((err: unknown) =>
      console.error('[freeswitchBridge] beginEslCallPipeline', err instanceof Error ? err.message : err)
    );
  }

  /** ESL `CHANNEL_HANGUP_COMPLETE` — tear down media pipeline and drop session map entry. */
  onChannelHangupComplete(callUuid: string, evt?: unknown): void {
    const ctx = this.activeCalls.get(callUuid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = evt as any;
    const cause = String(e?.getHeader?.('Hangup-Cause') || e?.getHeader?.('hangup_cause') || '').trim();

    if (ctx?.esl && ctx.answered === false) {
      void this.handleNeverAnsweredHangup(callUuid, ctx, cause);
    }

    void stopEslCallPipeline(callUuid, 'hangup').catch(() => {});
    this.activeCalls.delete(callUuid);
  }

  /** Call ended before CHANNEL_ANSWER (busy, no answer, etc.) — CRM still needs a row + lead update. */
  private async handleNeverAnsweredHangup(
    callId: string,
    ctx: { tenant_id: string; lead_id: string },
    causeRaw: string
  ): Promise<void> {
    const { outcome, summary } = mapEarlyHangupCause(causeRaw);
    try {
      await callStorage.updateCallStatus(callId, 'failed', causeRaw || outcome);
      await callStorage.saveCallResult({
        call_id: callId,
        transcript: '',
        summary,
        duration_seconds: 0,
        outcome,
        appointment_requested: false,
        proposed_appointment_iso: null,
      });
      await callStorage.logEvent(callId, 'early_hangup', { cause: causeRaw, outcome });
      await notifyBackendCallResult({
        tenant_id: ctx.tenant_id,
        lead_id: ctx.lead_id,
        call_id: callId,
        outcome,
        summary,
        transcript: '',
        duration_seconds: 0,
        appointment_requested: false,
        proposed_appointment_iso: null,
      });
      console.log(`[FreeSWITCH] early hangup ${callId} cause=${causeRaw || '∅'} → outcome=${outcome}`);
    } catch (err: unknown) {
      console.error('[FreeSWITCH] handleNeverAnsweredHangup', err instanceof Error ? err.message : err);
    }
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
      appointment_requested: summary.appointment_requested,
      proposed_appointment_iso: summary.proposed_appointment_iso ?? null,
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
          appointment_requested: summary.appointment_requested,
          proposed_appointment_iso: summary.proposed_appointment_iso ?? null,
        }),
      });
    } catch (_) {}
  }
}

export const freeswitchBridge = new FreeswitchBridge();
