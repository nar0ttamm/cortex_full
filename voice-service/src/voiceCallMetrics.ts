/**
 * Structured latency logs for tuning STT / LLM / TTS on real calls.
 * Parse with: pm2 logs cortex_voice | grep '\[metrics\]'
 */

export function metricVoice(
  callId: string,
  event: string,
  valueMs: number,
  extra?: Record<string, string | number | boolean>
): void {
  const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[metrics] call=${callId} event=${event} value_ms=${Math.round(valueMs)}${tail}`);
}
