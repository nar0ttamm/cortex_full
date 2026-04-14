import './bootstrap';
import { createServer } from 'http';
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
app.post('/voice/audio-fork/start', callController.startAudioFork);
app.post('/voice/audio-fork/stop', callController.stopAudioFork);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cortex_voice', timestamp: new Date().toISOString() });
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.LISTEN_HOST || '0.0.0.0';

const server = createServer(app);
attachAudioIngressWss(server);

server.listen(PORT, HOST, () => {
  console.log(`cortex_voice listening on http://${HOST}:${PORT} (WebSocket audio ingress: /audio-in/:callId)`);
  void initEslVoiceHooks();
});

export default app;
