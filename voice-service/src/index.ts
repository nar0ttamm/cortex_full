import './bootstrap';
import http from 'http';
import os from 'os';
import express from 'express';
import { callController } from './callController';
import { attachAudioIngressWss } from './audioIngressServer';
import { initEslVoiceHooks } from './eslVoiceHooks';
import { getLlmRuntimeSummary } from './conversationEngine';
import { getTtsRuntimeSummary, logTtsStartupHints } from './voiceSynthesis';
import { warmGreetingTtsCache } from './callMediaPipeline';

const app = express();
app.use(express.json());

// Internal API endpoints consumed by backend/Vercel
app.post('/voice/start-call', callController.startCall);
app.post('/voice/end-call', callController.endCall);
app.post('/voice/call-result', callController.callResult);

// V3: Agent runtime tool proxy endpoints — agent calls these; they proxy to backend
import { agentToolProxy } from './agentToolProxy';
app.post('/voice/tools/search-products', agentToolProxy.searchProducts);
app.post('/voice/tools/update-lead-memory', agentToolProxy.updateLeadMemory);
app.post('/voice/tools/log-analytics', agentToolProxy.logAnalytics);

app.get('/health', (_req, res) => {
  const llm = getLlmRuntimeSummary();
  const tts = getTtsRuntimeSummary();
  res.json({
    status: 'ok',
    service: 'cortex_voice',
    timestamp: new Date().toISOString(),
    llm_provider: llm.provider,
    llm_model: llm.model,
    tts_provider: tts.provider_effective,
    tts_requested: tts.provider_requested,
    ...(tts.deepgram_model ? { deepgram_tts_model: tts.deepgram_model } : {}),
    ...(tts.elevenlabs
      ? {
          elevenlabs_model: tts.elevenlabs.model,
          elevenlabs_voice_id_suffix: tts.elevenlabs.voice_id_suffix,
          elevenlabs_streaming_latency: tts.elevenlabs.streaming_latency,
          elevenlabs_natural_preset: tts.elevenlabs.natural_preset,
          elevenlabs_configured: tts.elevenlabs.configured,
        }
      : {}),
    tts_warnings: tts.warnings,
  });
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.LISTEN_HOST || '0.0.0.0';
const server = http.createServer(app);
attachAudioIngressWss(server);

server.listen(PORT, HOST, () => {
  const llm = getLlmRuntimeSummary();
  const tts = getTtsRuntimeSummary();
  console.log(`cortex_voice listening on http://${HOST}:${PORT}`);
  console.log(`[cortex_voice] LLM: ${llm.provider} (${llm.model})`);
  console.log(
    `[cortex_voice] TTS: ${tts.provider_effective}` +
      (tts.provider_effective === 'deepgram' ? ` (model=${tts.deepgram_model})` : '') +
      (tts.elevenlabs
        ? ` model=${tts.elevenlabs.model} voice=…${tts.elevenlabs.voice_id_suffix} latency=${tts.elevenlabs.streaming_latency}`
        : '')
  );
  logTtsStartupHints();
  const ttsTmpDir = process.env.VOICE_TTS_TMP_DIR?.trim();
  if (ttsTmpDir) {
    console.log(
      `[cortex_voice] VOICE_TTS_TMP_DIR=${ttsTmpDir} — uuid_broadcast uses these WAV paths; mount this dir into FreeSWITCH if FS is Docker.`
    );
  } else {
    console.log(
      `[cortex_voice] TTS WAV directory defaults to ${os.tmpdir()}. If FreeSWITCH runs in Docker on this host, set VOICE_TTS_TMP_DIR to a shared folder and bind-mount it into the FS container or outbound audio may stay silent.`
    );
  }
  void initEslVoiceHooks();
  void warmGreetingTtsCache();
});

export default app;
