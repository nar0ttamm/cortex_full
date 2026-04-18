import https from 'https';
import http from 'http';

/**
 * Voice synthesis (Text-to-Speech).
 *
 * Primary: Deepgram Aura TTS — extremely low cost, low latency, natural voice.
 * Fallback: Google TTS (if GOOGLE_TTS_API_KEY is set).
 *
 * Deepgram Aura pricing: ~$0.015 / 1000 characters (very cheap for short responses).
 * Returns PCM audio buffer at 8000 Hz suitable for telephony (G.711 PCMU).
 */

export const voiceSynthesis = {
  async synthesize(text: string): Promise<Buffer> {
    const provider = process.env.TTS_PROVIDER || 'deepgram';

    if (provider === 'deepgram') {
      return synthesizeDeepgram(text);
    } else if (provider === 'google') {
      return synthesizeGoogleTTS(text);
    } else {
      return synthesizeDeepgram(text);
    }
  },
};

async function synthesizeDeepgram(text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const options = {
      hostname: 'api.deepgram.com',
      path: '/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=8000',
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function synthesizeGoogleTTS(text: string): Promise<Buffer> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY not configured');

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'en-IN', name: 'en-IN-Wavenet-D' },
      audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 8000 },
    });

    const options = {
      hostname: 'texttospeech.googleapis.com',
      path: `/v1/text:synthesize?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const audioContent = parsed.audioContent;
          resolve(Buffer.from(audioContent, 'base64'));
        } catch (err) {
          reject(new Error('Failed to parse Google TTS response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** PCM16 mono 8 kHz linear16 for telephony WAV / `uuid_broadcast` (see `callMediaPipeline`). */
export async function synthesizeTelephonyPcm8k(text: string): Promise<Buffer> {
  return voiceSynthesis.synthesize(text);
}
