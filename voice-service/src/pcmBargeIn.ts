/**
 * Energy-based barge-in while TTS plays: forked PCM still arrives but is not sent to Deepgram
 * (avoids echo). RMS on 16-bit mono frames approximates “user is speaking over the robot.”
 */

const DEFAULT_RMS = 1400;
const DEFAULT_HOLD_MS = 110;
const DEFAULT_SAMPLE_RATE = 16000;

export function pcm16leMonoRms(buf: Buffer): number {
  if (buf.length < 2) return 0;
  const n = Math.floor(buf.length / 2);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(i * 2);
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

export function getBargeInSampleRate(): number {
  const mix = (process.env.AUDIO_FORK_MIX || 'mono 16k').trim().toLowerCase();
  if (mix.includes('8k') || mix.includes('8000')) return 8000;
  return Math.max(8000, parseInt(process.env.VOICE_BARGE_IN_SAMPLE_RATE || String(DEFAULT_SAMPLE_RATE), 10));
}

export function bargeInThresholdRms(): number {
  return Math.max(200, parseInt(process.env.VOICE_BARGE_IN_RMS || String(DEFAULT_RMS), 10));
}

export function bargeInHoldMs(): number {
  return Math.max(40, parseInt(process.env.VOICE_BARGE_IN_HOLD_MS || String(DEFAULT_HOLD_MS), 10));
}

export function bargeInEnabled(): boolean {
  const v = (process.env.VOICE_BARGE_IN_ENABLED ?? 'true').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/** Returns true when sustained energy crosses the hold threshold (call once per PCM chunk). */
export function accumulateBargeEnergy(buf: Buffer, sampleRate: number, state: { accMs: number }): boolean {
  const rms = pcm16leMonoRms(buf);
  const threshold = bargeInThresholdRms();
  const hold = bargeInHoldMs();
  const chunkMs = (buf.length / 2 / sampleRate) * 1000;
  if (rms >= threshold) {
    state.accMs += chunkMs;
  } else {
    state.accMs = Math.max(0, state.accMs - chunkMs * 0.65);
  }
  if (state.accMs >= hold) {
    state.accMs = 0;
    return true;
  }
  return false;
}
