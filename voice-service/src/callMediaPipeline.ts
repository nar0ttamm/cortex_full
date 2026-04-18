import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { speechRecognition } from './speechRecognition';
import { conversationEngine, hasLlmConfigured } from './conversationEngine';
import { synthesizeTelephonyPcm8k } from './voiceSynthesis';
import { registerAudioConsumer, buildAudioIngressUrl } from './audioIngressServer';
import { uuidAudioForkStart, uuidAudioForkStop, uuidBroadcast, uuidBreak, uuidKill } from './eslClient';
import { callStorage } from './callStorage';
import { sessionStore } from './sessionStore';
import { notifyBackendCallResult, notifyBackendCallEvent } from './backendNotify';
import { pcm16leMonoToWav } from './wavUtil';
import { metricVoice } from './voiceCallMetrics';

type Message = { role: 'user' | 'assistant'; content: string };

export interface PipelineCtx {
  tenant_id: string;
  lead_id: string;
  phone: string;
  name: string;
  callScript?: string;
  startedAt: number;
  /** Set when CHANNEL_ANSWER runs — used for latency metrics. */
  answeredAt?: number;
}

interface Runtime {
  ctx: PipelineCtx;
  stt: ReturnType<typeof speechRecognition.createStreamingSession>;
  unregister: () => void;
  conversationHistory: Message[];
  generation: number;
  aiSpeaking: boolean;
  /** While true, do not send forked PCM to Deepgram (prevents TTS→echo→STT loops). */
  blockSttAudio: boolean;
  /** Ignore PCM until this time (ms epoch) after TTS for residual echo. */
  sttGateUntil: number;
  processingUserTurn: boolean;
  ended: boolean;
  lastUserNorm: string;
  lastUserAt: number;
  turnIndex: number;
}

const pipelines = new Map<string, Runtime>();

let ttsDirHintLogged = false;

function getTtsOutputDir(): string {
  const raw = process.env.VOICE_TTS_TMP_DIR?.trim();
  return raw && raw.length > 0 ? raw : os.tmpdir();
}

/** After TTS + playback, ignore forked audio briefly so echo does not become a fake “user” turn. */
const POST_TTS_GATE_MS = parseInt(process.env.VOICE_STT_POST_TTS_MS || '700', 10);
/** Deepgram sometimes emits duplicate finals; ignore repeats within this window. */
const USER_UTTERANCE_DEDUPE_MS = parseInt(process.env.VOICE_STT_DEDUPE_MS || '2800', 10);

function normalizeUtterance(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s?.!।]/gu, '')
    .trim();
}

async function writeTempWav(callId: string, seq: number, wav: Buffer): Promise<string> {
  const safe = callId.replace(/[^a-fA-F0-9-]/g, '');
  const dir = getTtsOutputDir();
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, `cortexflow-tts-${safe}-${seq}-${Date.now()}.wav`);
  await fs.writeFile(fp, wav);
  if (!ttsDirHintLogged) {
    ttsDirHintLogged = true;
    const st = await fs.stat(fp);
    console.log(
      `[pipeline] TTS wav ${st.size} bytes -> ${fp}. FreeSWITCH must read this exact path; if FS runs in Docker, bind-mount this directory into the container at the same absolute path (see VOICE_TTS_TMP_DIR).`
    );
  }
  return fp;
}

async function speakText(callId: string, rt: Runtime, text: string, seqRef: { n: number }): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  rt.blockSttAudio = true;
  const gen = rt.generation;
  try {
    const pcm = await synthesizeTelephonyPcm8k(trimmed);
    if (gen !== rt.generation) return;
    if (pcm.length < 320) {
      console.warn(`[pipeline:${callId}] TTS PCM very short (${pcm.length} bytes) — check TTS_PROVIDER and API keys`);
    }
    const wav = pcm16leMonoToWav(pcm, 8000);
    seqRef.n += 1;
    const fp = await writeTempWav(callId, seqRef.n, wav);
    rt.aiSpeaking = true;
    try {
      // Outbound to PSTN: audio often needs `bleg` or `both`; `aleg` alone can be silent on some trunks.
      const leg = (process.env.UUID_BROADCAST_LEG || 'both').trim() as 'aleg' | 'bleg' | 'both';
      await uuidBroadcast(callId, fp, leg);
    } catch (e) {
      console.warn(`[pipeline:${callId}] uuid_broadcast`, (e as Error).message);
    }
    const ms = Math.max(500, Math.min(30000, (pcm.length / 2 / 8000) * 1000 + 250));
    await new Promise<void>(resolve => setTimeout(resolve, ms));
    rt.aiSpeaking = false;
    void fs.unlink(fp).catch(() => {});
  } finally {
    rt.blockSttAudio = false;
    rt.sttGateUntil = Date.now() + POST_TTS_GATE_MS;
  }
}

/**
 * After CHANNEL_ANSWER: fork audio → STT → LLM → TTS → uuid_broadcast.
 */
export async function beginEslCallPipeline(callId: string, ctx: PipelineCtx): Promise<void> {
  if (process.env.VOICE_REALTIME_PIPELINE === 'false') {
    console.log(`[pipeline:${callId}] VOICE_REALTIME_PIPELINE=false — skipping AI pipeline`);
    return;
  }
  if (!process.env.DEEPGRAM_API_KEY || !hasLlmConfigured()) {
    console.error(`[pipeline:${callId}] Missing DEEPGRAM_API_KEY or LLM keys (GEMINI_API_KEY / OPENAI_API_KEY per LLM_PROVIDER) — cannot start pipeline`);
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
  void notifyBackendCallEvent({
    tenant_id: ctx.tenant_id,
    lead_id: ctx.lead_id,
    call_id: callId,
    phase: 'ongoing',
  });

  const seqRef = { n: 0 };
  const conversationHistory: Message[] = [];

  const rt: Runtime = {
    ctx,
    stt: null as unknown as ReturnType<typeof speechRecognition.createStreamingSession>,
    unregister: () => {},
    conversationHistory,
    generation: 0,
    aiSpeaking: false,
    blockSttAudio: true,
    sttGateUntil: 0,
    processingUserTurn: false,
    ended: false,
    lastUserNorm: '',
    lastUserAt: 0,
    turnIndex: 0,
  };

  const answeredAt = ctx.answeredAt ?? Date.now();

  const stt = speechRecognition.createStreamingSession({
    onTranscript: async (text: string, isFinal: boolean) => {
      if (rt.ended) return;
      if (!isFinal) return;
      const cleaned = text.trim();
      if (!cleaned) return;
      const norm = normalizeUtterance(cleaned);
      const now = Date.now();
      if (norm && norm === rt.lastUserNorm && now - rt.lastUserAt < USER_UTTERANCE_DEDUPE_MS) {
        return;
      }
      if (norm) {
        rt.lastUserNorm = norm;
        rt.lastUserAt = now;
      }
      if (rt.processingUserTurn) return;
      rt.processingUserTurn = true;
      const turnStart = Date.now();
      rt.turnIndex += 1;
      const turnN = rt.turnIndex;
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

        metricVoice(callId, 'turn_user_to_ai_done', Date.now() - turnStart, { turn: turnN });

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
      rt.blockSttAudio = false;
      rt.sttGateUntil = 0;
      void uuidBreak(callId).catch(() => {});
      rt.aiSpeaking = false;
    },
    onError: err => console.error(`[pipeline:${callId}] STT`, err.message),
  });

  rt.stt = stt;
  rt.unregister = registerAudioConsumer(callId, buf => {
    if (rt.ended) return;
    if (rt.blockSttAudio || Date.now() < rt.sttGateUntil) return;
    stt.write(buf);
  });

  try {
    const wsUrl = buildAudioIngressUrl(callId);
    const ingressExplicit = Boolean(process.env.AUDIO_INGRESS_WS_BASE?.trim());
    if (
      !ingressExplicit &&
      /\/\/127\.0\.0\.1|\/\/localhost/.test(wsUrl)
    ) {
      console.warn(
        `[pipeline:${callId}] WebSocket URL uses default loopback. If FreeSWITCH uses Docker bridge networking, set AUDIO_INGRESS_WS_BASE=ws://172.17.0.1:PORT (or the host IP FreeSWITCH can reach). For Docker --network host, set AUDIO_INGRESS_WS_BASE=ws://127.0.0.1:5000 explicitly to silence this.`
      );
    }
    console.log(`[pipeline:${callId}] uuid_audio_fork ws: ${wsUrl.split('?')[0]}…`);
    // drachtio mod_audio_fork API: `uuid_audio_fork <uuid> start <url> <mix-type> <rate> [metadata]`
    // mix-type: mono | mixed | stereo — rate: 8k | 16k (NOT mono@16000h; that form breaks the parser → -ERR no reply)
    const mix = (process.env.AUDIO_FORK_MIX || 'mono 16k').trim();
    await uuidAudioForkStart({ callUuid: callId, wsUrl, mix });
    metricVoice(callId, 'answer_to_audio_fork', Date.now() - answeredAt);
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

  // Clear any placeholder media (e.g. silence_stream) so the first uuid_broadcast is clean.
  await uuidBreak(callId).catch(() => {});

  const greeting =
    ctx.callScript ||
    `Namaste, main CortexFlow se call kar raha hoon — ${ctx.name} ji, abhi thoda time milega baat karne ka?`;

  rt.conversationHistory.push({ role: 'assistant', content: greeting });
  const g0 = Date.now();
  try {
    await speakText(callId, rt, greeting, seqRef);
    metricVoice(callId, 'answer_to_greeting_done', Date.now() - answeredAt);
    metricVoice(callId, 'greeting_tts_only', Date.now() - g0);
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
      appointment_requested: summary.appointment_requested,
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
    appointment_requested: summary.appointment_requested,
  });
}
