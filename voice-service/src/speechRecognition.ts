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

    const live = deepgram.listen.live({
      model: 'nova-2',
      language: 'en-IN',           // Indian English — change as needed
      encoding: 'linear16',
      sample_rate: 8000,           // Standard telephony (PCMU/G711)
      channels: 1,
      punctuate: true,
      interim_results: true,
      endpointing: 300,            // VAD: send final transcript after 300ms silence
      utterance_end_ms: 1000,      // Treat as speech end after 1s of silence
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
