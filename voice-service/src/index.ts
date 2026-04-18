import './bootstrap';
import http from 'http';
import os from 'os';
import express from 'express';
import { callController } from './callController';
import { attachAudioIngressWss } from './audioIngressServer';
import { initEslVoiceHooks } from './eslVoiceHooks';

const app = express();
app.use(express.json());

// Internal API endpoints consumed by backend/Vercel
app.post('/voice/start-call', callController.startCall);
app.post('/voice/end-call', callController.endCall);
app.post('/voice/call-result', callController.callResult);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cortex_voice', timestamp: new Date().toISOString() });
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.LISTEN_HOST || '0.0.0.0';
const server = http.createServer(app);
attachAudioIngressWss(server);

server.listen(PORT, HOST, () => {
  console.log(`cortex_voice listening on http://${HOST}:${PORT}`);
  const tts = process.env.VOICE_TTS_TMP_DIR?.trim();
  if (tts) {
    console.log(
      `[cortex_voice] VOICE_TTS_TMP_DIR=${tts} — uuid_broadcast uses these WAV paths; mount this dir into FreeSWITCH if FS is Docker.`
    );
  } else {
    console.log(
      `[cortex_voice] TTS WAV directory defaults to ${os.tmpdir()}. If FreeSWITCH runs in Docker on this host, set VOICE_TTS_TMP_DIR to a shared folder and bind-mount it into the FS container or outbound audio may stay silent.`
    );
  }
  void initEslVoiceHooks();
});

export default app;
