import https from 'https';

/**
 * ElevenLabs streaming TTS — collect full utterance PCM for uuid_broadcast.
 * Default output pcm_16000; downsample to 8 kHz in voice layer for G.711-friendly WAV.
 */

function getVoiceId(): string {
  const v = (process.env.ELEVENLABS_VOICE_ID || '').trim();
  if (!v) throw new Error('ELEVENLABS_VOICE_ID is not set');
  return v;
}

function getModelId(): string {
  return (process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5').trim();
}

export async function synthesizeElevenLabsToPcm16(text: string): Promise<{ pcm: Buffer; sampleRate: number }> {
  const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const voiceId = getVoiceId();
  const outputFormat = (process.env.ELEVENLABS_OUTPUT_FORMAT || 'pcm_16000').trim();
  const path =
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream` +
    `?output_format=${encodeURIComponent(outputFormat)}&optimize_streaming_latency=3`;

  const body = JSON.stringify({
    text,
    model_id: getModelId(),
  });

  const sampleRate = sampleRateFromOutputFormat(outputFormat);

  const pcm = await new Promise<Buffer>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.elevenlabs.io',
        path,
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'audio/*',
        },
      },
      res => {
        if (res.statusCode && res.statusCode >= 400) {
          const chunks: Buffer[] = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () =>
            reject(new Error(`ElevenLabs HTTP ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').slice(0, 500)}`))
          );
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  return { pcm, sampleRate };
}

function sampleRateFromOutputFormat(fmt: string): number {
  if (fmt.includes('44100')) return 44100;
  if (fmt.includes('24000')) return 24000;
  if (fmt.includes('22050')) return 22050;
  if (fmt.includes('16000')) return 16000;
  return 16000;
}
