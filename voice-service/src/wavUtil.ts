/**
 * Wrap raw PCM16 LE mono in a WAV container for FreeSWITCH uuid_broadcast.
 */

export function pcm16leMonoToWav(pcm: Buffer, sampleRateHz: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRateHz * blockAlign;
  const dataSize = pcm.length;
  const riffSize = 36 + dataSize;
  const out = Buffer.alloc(44 + dataSize);

  out.write('RIFF', 0);
  out.writeUInt32LE(riffSize, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(numChannels, 22);
  out.writeUInt32LE(sampleRateHz, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(bitsPerSample, 34);
  out.write('data', 36);
  out.writeUInt32LE(dataSize, 40);
  pcm.copy(out, 44);
  return out;
}

/** Simple 2:1 decimation for telephony (16 kHz → 8 kHz) without extra deps. */
export function downsamplePcm16Mono16kTo8k(pcm16: Buffer): Buffer {
  const inSamples = Math.floor(pcm16.length / 2);
  const outSamples = Math.floor(inSamples / 2);
  const out = Buffer.alloc(outSamples * 2);
  for (let o = 0; o < outSamples; o++) {
    const i0 = o * 2;
    const i1 = i0 + 1;
    const s0 = pcm16.readInt16LE(i0 * 2);
    const s1 = i1 < inSamples ? pcm16.readInt16LE(i1 * 2) : s0;
    const avg = Math.max(-32768, Math.min(32767, Math.round((s0 + s1) / 2)));
    out.writeInt16LE(avg, o * 2);
  }
  return out;
}
