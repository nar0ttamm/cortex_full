import https from 'https';
import { synthesizeElevenLabsToPcm16 } from './elevenLabsTts';
import { downsamplePcm16Mono16kTo8k } from './wavUtil';

/**
 * TTS for telephony playback (PCM16 mono 8 kHz linear) — uuid_broadcast WAV.
 * Phase D default: ElevenLabs (stream collected to buffer). Optional: Deepgram Aura, Google.
 */

export async function synthesizeTelephonyPcm8k(text: string): Promise<Buffer> {
  let provider = (process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase().trim();
  if (
    provider === 'elevenlabs' &&
    !(process.env.ELEVENLABS_API_KEY || '').trim() &&
    (process.env.DEEPGRAM_API_KEY || '').trim()
  ) {
    console.warn('[voiceSynthesis] ELEVENLABS_API_KEY missing — using Deepgram Aura for telephony PCM');
    provider = 'deepgram';
  }
  if (provider === 'elevenlabs') {
    const { pcm, sampleRate } = await synthesizeElevenLabsToPcm16(text);
    if (sampleRate === 8000) return pcm;
    if (sampleRate === 16000) return downsamplePcm16Mono16kTo8k(pcm);
    throw new Error(
      `ElevenLabs sample rate ${sampleRate} Hz is not supported for telephony; set ELEVENLABS_OUTPUT_FORMAT=pcm_16000`
    );
  }
  return synthesizeLegacyPcm8k(text, provider);
}

/** @deprecated for new code — use synthesizeTelephonyPcm8k */
export const voiceSynthesis = {
  async synthesize(text: string): Promise<Buffer> {
    return synthesizeTelephonyPcm8k(text);
  },
};

async function synthesizeLegacyPcm8k(text: string, provider: string): Promise<Buffer> {
  if (provider === 'google') {
    return synthesizeGoogleTTS(text);
  }
  return synthesizeDeepgram(text);
}

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
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
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

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const audioContent = parsed.audioContent;
          resolve(Buffer.from(audioContent, 'base64'));
        } catch {
          reject(new Error('Failed to parse Google TTS response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
