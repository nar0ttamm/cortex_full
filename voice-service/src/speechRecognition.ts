import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

/**
 * Deepgram streaming speech-to-text.
 * Uses nova-2 model for lowest cost with high accuracy.
 * VAD (voice activity detection) handled by Deepgram's endpointing feature.
 */

interface StreamingSessionOptions {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (err: Error) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
}

interface StreamingSession {
  write: (audioChunk: Buffer) => void;
  close: () => void;
}

export const speechRecognition = {
  createStreamingSession(opts: StreamingSessionOptions): StreamingSession {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) throw new Error('DEEPGRAM_API_KEY not configured');

    const deepgram = createClient(apiKey);

    const sampleRate = parseInt(process.env.DEEPGRAM_SAMPLE_RATE || '16000', 10);
    const endpointing = parseInt(process.env.DEEPGRAM_ENDPOINTING_MS || '260', 10);
    const utteranceEndMs = parseInt(process.env.DEEPGRAM_UTTERANCE_END_MS || '900', 10);
    const model = (process.env.DEEPGRAM_MODEL || 'nova-2').trim();
    const language = (process.env.DEEPGRAM_LANGUAGE || 'en-IN').trim();

    const live = deepgram.listen.live({
      model,
      language,
      encoding: 'linear16',
      sample_rate: sampleRate,
      channels: 1,
      punctuate: true,
      interim_results: true,
      endpointing,
      utterance_end_ms: utteranceEndMs,
      vad_events: true,
    });

    live.on(LiveTranscriptionEvents.Open, () => {
      console.log('[Deepgram] Streaming session opened');
    });

    live.on(LiveTranscriptionEvents.Transcript, (data) => {
      const channel = data.channel?.alternatives?.[0];
      if (!channel) return;

      const text = channel.transcript?.trim();
      if (!text) return;

      const isFinal = data.is_final ?? false;
      opts.onTranscript(text, isFinal);
    });

    live.on(LiveTranscriptionEvents.SpeechStarted, () => {
      opts.onSpeechStart?.();
    });

    live.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      opts.onSpeechEnd?.();
    });

    live.on(LiveTranscriptionEvents.Error, (err) => {
      opts.onError(new Error(String(err)));
    });

    live.on(LiveTranscriptionEvents.Close, () => {
      console.log('[Deepgram] Streaming session closed');
    });

    return {
      write(audioChunk: Buffer) {
        if (live.getReadyState() === 1) {
          live.send(audioChunk as unknown as string);
        }
      },
      close() {
        live.finish();
      },
    };
  },
};
