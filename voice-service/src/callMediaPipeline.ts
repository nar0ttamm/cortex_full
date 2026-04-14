import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { speechRecognition } from './speechRecognition';
import { conversationEngine } from './conversationEngine';
import { synthesizeTelephonyPcm8k } from './voiceSynthesis';
import { registerAudioConsumer, buildAudioIngressUrl } from './audioIngressServer';
import { uuidAudioForkStart, uuidAudioForkStop, uuidBroadcast, uuidBreak, uuidKill } from './eslClient';
import { callStorage } from './callStorage';
import { sessionStore } from './sessionStore';
import { notifyBackendCallResult } from './backendNotify';
import { pcm16leMonoToWav } from './wavUtil';

type Message = { role: 'user' | 'assistant'; content: string };

export interface PipelineCtx {
  tenant_id: string;
  lead_id: string;
  phone: string;
  name: string;
  callScript?: string;
  startedAt: number;
}

interface Runtime {
  ctx: PipelineCtx;
  stt: ReturnType<typeof speechRecognition.createStreamingSession>;
  unregister: () => void;
  conversationHistory: Message[];
  generation: number;
  aiSpeaking: boolean;
  processingUserTurn: boolean;
  ended: boolean;
}

const pipelines = new Map<string, Runtime>();

async function writeTempWav(callId: string, seq: number, wav: Buffer): Promise<string> {
  const safe = callId.replace(/[^a-fA-F0-9-]/g, '');
  const dir = os.tmpdir();
  const fp = path.join(dir, `cortexflow-tts-${safe}-${seq}-${Date.now()}.wav`);
  await fs.writeFile(fp, wav);
  return fp;
}

async function speakText(callId: string, rt: Runtime, text: string, seqRef: { n: number }): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const gen = rt.generation;
  const pcm = await synthesizeTelephonyPcm8k(trimmed);
  if (gen !== rt.generation) return;
  const wav = pcm16leMonoToWav(pcm, 8000);
  seqRef.n += 1;
  const fp = await writeTempWav(callId, seqRef.n, wav);
  rt.aiSpeaking = true;
  try {
    await uuidBroadcast(callId, fp, 'aleg');
  } catch (e) {
    console.warn(`[pipeline:${callId}] uuid_broadcast`, (e as Error).message);
  }
  const ms = Math.max(500, Math.min(30000, (pcm.length / 2 / 8000) * 1000 + 250));
  await new Promise<void>(resolve => setTimeout(resolve, ms));
  rt.aiSpeaking = false;
  void fs.unlink(fp).catch(() => {});
}

/**
 * After CHANNEL_ANSWER: fork audio → STT → LLM → TTS → uuid_broadcast.
 */
export async function beginEslCallPipeline(callId: string, ctx: PipelineCtx): Promise<void> {
  if (process.env.VOICE_REALTIME_PIPELINE === 'false') {
    console.log(`[pipeline:${callId}] VOICE_REALTIME_PIPELINE=false — skipping AI pipeline`);
    return;
  }
  if (!process.env.DEEPGRAM_API_KEY || !process.env.GEMINI_API_KEY) {
    console.error(`[pipeline:${callId}] Missing DEEPGRAM_API_KEY or GEMINI_API_KEY — cannot start pipeline`);
    return;
  }
  if (pipelines.has(callId)) return;

  await sessionStore.merge(callId, {
    tenant_id: ctx.tenant_id,
    lead_id: ctx.lead_id,
    speaker: 'system',
    transcript_tail: '',
  });

  await callStorage.updateCallStatus(callId, 'active');
  await callStorage.logEvent(callId, 'call_answered', { source: 'esl' });

  const seqRef = { n: 0 };
  const conversationHistory: Message[] = [];

  const rt: Runtime = {
    ctx,
    stt: null as unknown as ReturnType<typeof speechRecognition.createStreamingSession>,
    unregister: () => {},
    conversationHistory,
    generation: 0,
    aiSpeaking: false,
    processingUserTurn: false,
    ended: false,
  };

  const stt = speechRecognition.createStreamingSession({
    onTranscript: async (text: string, isFinal: boolean) => {
      if (rt.ended) return;
      if (!isFinal) return;
      const cleaned = text.trim();
      if (!cleaned) return;
      if (rt.processingUserTurn) return;
      rt.processingUserTurn = true;
      try {
        console.log(`[pipeline:${callId}] user: ${cleaned}`);
        await callStorage.logEvent(callId, 'stt_final', { text: cleaned });
        rt.conversationHistory.push({ role: 'user', content: cleaned });
        await sessionStore.merge(callId, {
          tenant_id: ctx.tenant_id,
          lead_id: ctx.lead_id,
          speaker: 'user',
          transcript_tail: cleaned,
        });

        let responseText = '';
        await conversationEngine.streamResponse(rt.conversationHistory, async (chunk: string) => {
          responseText += chunk;
          await speakText(callId, rt, chunk, seqRef);
        });

        const assistantText = responseText.trim();
        if (assistantText) {
          rt.conversationHistory.push({ role: 'assistant', content: assistantText });
          await callStorage.logEvent(callId, 'ai_reply', { text: assistantText });
          await sessionStore.merge(callId, {
            tenant_id: ctx.tenant_id,
            lead_id: ctx.lead_id,
            speaker: 'ai',
            transcript_tail: assistantText,
          });
        }

        if (conversationEngine.shouldEndCall(responseText)) {
          setTimeout(() => void finalizePipeline(callId, 'wrap_up'), 1200);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[pipeline:${callId}] turn error`, msg);
      } finally {
        rt.processingUserTurn = false;
      }
    },
    onSpeechStart: () => {
      if (rt.ended) return;
      rt.generation += 1;
      void uuidBreak(callId).catch(() => {});
      rt.aiSpeaking = false;
    },
    onError: err => console.error(`[pipeline:${callId}] STT`, err.message),
  });

  rt.stt = stt;
  rt.unregister = registerAudioConsumer(callId, buf => stt.write(buf));

  try {
    const wsUrl = buildAudioIngressUrl(callId);
    const mix = (process.env.AUDIO_FORK_MIX || 'mono@16000h').trim();
    await uuidAudioForkStart({ callUuid: callId, wsUrl, mix });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[pipeline:${callId}] uuid_audio_fork failed`, msg);
    rt.unregister();
    try {
      stt.close();
    } catch (_) {}
    await callStorage.logEvent(callId, 'audio_fork_failed', { error: msg });
    throw new Error(`uuid_audio_fork failed: ${msg}`);
  }

  pipelines.set(callId, rt);

  const greeting =
    ctx.callScript ||
    `Namaste, main CortexFlow se baat kar raha hoon — kya main ${ctx.name} ji se baat kar sakta hoon?`;

  rt.conversationHistory.push({ role: 'assistant', content: greeting });
  try {
    await speakText(callId, rt, greeting, seqRef);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[pipeline:${callId}] greeting TTS failed`, msg);
  }
}

async function finalizePipeline(callId: string, _reason: string): Promise<void> {
  const rt = pipelines.get(callId);
  if (!rt || rt.ended) return;
  rt.ended = true;
  await stopEslCallPipeline(callId, 'completed');
  void uuidKill(callId).catch(() => {});
}

/**
 * Tear down media + STT, persist transcript, notify backend.
 */
export async function stopEslCallPipeline(callId: string, reason?: string): Promise<void> {
  const rt = pipelines.get(callId);
  if (!rt) {
    await sessionStore.delete(callId);
    return;
  }

  pipelines.delete(callId);
  rt.ended = true;

  try {
    rt.unregister();
  } catch (_) {}
  try {
    rt.stt.close();
  } catch (_) {}
  try {
    await uuidAudioForkStop(callId);
  } catch (_) {}

  await sessionStore.delete(callId);

  const { ctx, conversationHistory } = rt;
  const durationSeconds = Math.max(0, Math.floor((Date.now() - ctx.startedAt) / 1000));
  const fullTranscript = conversationHistory
    .map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`)
    .join('\n');

  let summary = await conversationEngine.summarizeCall(conversationHistory);
  if (!summary.text && !fullTranscript.trim()) {
    summary = {
      text:
        reason === 'ended_by_api'
          ? 'Call ended by system.'
          : 'No conversation captured (likely no answer or immediate hangup).',
      outcome: 'unknown',
      appointment_requested: false,
    };
  }

  try {
    await callStorage.saveCallResult({
      call_id: callId,
      transcript: fullTranscript,
      summary: summary.text,
      duration_seconds: durationSeconds,
      outcome: summary.outcome,
    });
    await callStorage.logEvent(callId, 'pipeline_stopped', { reason: reason || 'unknown' });
  } catch (e: unknown) {
    console.error(`[pipeline:${callId}] save failed`, e instanceof Error ? e.message : e);
  }

  await notifyBackendCallResult({
    tenant_id: ctx.tenant_id,
    lead_id: ctx.lead_id,
    call_id: callId,
    outcome: summary.outcome,
    transcript: fullTranscript,
    summary: summary.text,
    duration_seconds: durationSeconds,
  });
}
