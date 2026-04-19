import https from 'https';
import http from 'http';
import { synthesizeElevenLabsToPcm16 } from './elevenLabsTts';
import { downsamplePcm16Mono16kTo8k } from './wavUtil';

/** Default Aura-2 voice when `DEEPGRAM_TTS_MODEL` is unset (`TTS_PROVIDER=deepgram`). */
export const DEFAULT_DEEPGRAM_TTS_MODEL = 'aura-2-harmonia-en';

/** Resolved Deepgram TTS model id (Aura / Aura-2). See https://developers.deepgram.com/docs/tts-models */
export function getDeepgramTtsModel(): string {
  const m = (process.env.DEEPGRAM_TTS_MODEL || DEFAULT_DEEPGRAM_TTS_MODEL).trim();
  return m || DEFAULT_DEEPGRAM_TTS_MODEL;
}

/**
 * Voice synthesis (Text-to-Speech).
 *
 * Providers: deepgram | google | elevenlabs
 * Returns PCM16 mono at **8000 Hz** for telephony WAV / uuid_broadcast.
 *
 * Important: ElevenLabs env vars are ignored unless **TTS_PROVIDER=elevenlabs**.
 */

export type TtsEffectiveProvider = 'deepgram' | 'google' | 'elevenlabs';

export interface TtsRuntimeSummary {
  provider_requested: string;
  provider_effective: TtsEffectiveProvider;
  /** Deepgram Aura / Aura-2 voice (`DEEPGRAM_TTS_MODEL`). */
  deepgram_model?: string;
  elevenlabs?: {
    model: string;
    voice_id_suffix: string;
    streaming_latency: string;
    natural_preset: boolean;
    configured: boolean;
  };
  /** Misconfiguration hints (e.g. ElevenLabs ID set but provider still deepgram). */
  warnings: string[];
}

function collectTtsWarnings(): string[] {
  const w: string[] = [];
  const req = (process.env.TTS_PROVIDER || 'deepgram').trim().toLowerCase();
  const hasElId = Boolean((process.env.ELEVENLABS_VOICE_ID || '').trim());
  const hasElKey = Boolean((process.env.ELEVENLABS_API_KEY || '').trim());
  if (req !== 'elevenlabs' && (hasElId || hasElKey)) {
    w.push(
      'ElevenLabs env vars are set but TTS_PROVIDER is not elevenlabs — audio still uses Deepgram Aura. Set TTS_PROVIDER=elevenlabs (and keep ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID).'
    );
  }
  if (req === 'elevenlabs') {
    if (!hasElKey) w.push('TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing — TTS will error at runtime');
    if (!hasElId) w.push('TTS_PROVIDER=elevenlabs but ELEVENLABS_VOICE_ID is missing — TTS will error at runtime');
  }
  return w;
}

/** For /health and startup logs — does not call vendor APIs. */
export function getTtsRuntimeSummary(): TtsRuntimeSummary {
  const req = (process.env.TTS_PROVIDER || 'deepgram').trim().toLowerCase();
  const warnings = collectTtsWarnings();
  const hasEl = Boolean((process.env.ELEVENLABS_API_KEY || '').trim() && (process.env.ELEVENLABS_VOICE_ID || '').trim());

  if (req === 'google') {
    return { provider_requested: req, provider_effective: 'google', warnings };
  }
  if (req === 'elevenlabs') {
    const vid = (process.env.ELEVENLABS_VOICE_ID || '').trim();
    const suffix = vid.length >= 4 ? vid.slice(-4) : vid || '—';
    const natural =
      (process.env.ELEVENLABS_NATURAL_PRESET || 'true').trim().toLowerCase() !== 'false' &&
      (process.env.ELEVENLABS_NATURAL_PRESET || 'true').trim() !== '0';
    return {
      provider_requested: req,
      provider_effective: 'elevenlabs',
      elevenlabs: {
        model: (process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5').trim(),
        voice_id_suffix: suffix,
        streaming_latency: (process.env.ELEVENLABS_STREAM_LATENCY || '1').trim(),
        natural_preset: natural,
        configured: hasEl,
      },
      warnings,
    };
  }

  return {
    provider_requested: req || 'deepgram',
    provider_effective: 'deepgram',
    deepgram_model: getDeepgramTtsModel(),
    warnings,
  };
}

let ttsWarningsLogged = false;
export function logTtsStartupHints(): void {
  if (ttsWarningsLogged) return;
  ttsWarningsLogged = true;
  const s = getTtsRuntimeSummary();
  for (const line of s.warnings) {
    console.warn(`[cortex_voice TTS] ${line}`);
  }
}

export const voiceSynthesis = {
  async synthesize(text: string): Promise<Buffer> {
    const provider = (process.env.TTS_PROVIDER || 'deepgram').trim().toLowerCase();

    if (provider === 'deepgram') {
      return synthesizeDeepgram(text);
    }
    if (provider === 'google') {
      return synthesizeGoogleTTS(text);
    }
    if (provider === 'elevenlabs') {
      const { pcm, sampleRate } = await synthesizeElevenLabsToPcm16(text);
      if (sampleRate === 8000) return pcm;
      if (sampleRate === 16000) return downsamplePcm16Mono16kTo8k(pcm);
      return downsamplePcm16Mono16kTo8k(pcm);
    }
    return synthesizeDeepgram(text);
  },
};

async function synthesizeDeepgram(text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');

  return new Promise((resolve, reject) => {
    const model = encodeURIComponent(getDeepgramTtsModel());
    const body = JSON.stringify({ text });
    const options = {
      hostname: 'api.deepgram.com',
      path: `/v1/speak?model=${model}&encoding=linear16&sample_rate=8000`,
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
