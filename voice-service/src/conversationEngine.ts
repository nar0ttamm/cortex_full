import OpenAI from 'openai';

/**
 * AI conversation engine: OpenAI streaming for low first-word latency.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CallSummary {
  text: string;
  outcome: 'interested' | 'not_interested' | 'callback' | 'appointment_booked' | 'unknown';
  appointment_requested: boolean;
  /** ISO 8601 with offset when caller agreed a concrete slot (e.g. Asia/Kolkata +05:30). */
  proposed_appointment_iso?: string | null;
}

const SYSTEM_PROMPT = `You are a friendly and professional AI sales assistant for a business using CortexFlow CRM.
Your role is to:
1. Warmly greet the prospect and confirm their interest
2. Briefly explain how the business can help them
3. Ask qualifying questions about their needs
4. If interested, offer to schedule an appointment or callback
5. Keep responses SHORT — 1-2 sentences max per turn, like a real phone conversation
6. Be natural, empathetic, and never robotic
7. Detect when the conversation is naturally ending and wrap up politely

When the prospect wants to schedule: confirm date AND time in plain words (e.g. "tomorrow twelve noon IST"), then say they'll see it on the CRM calendar.
Default to Indian English / Hinglish if they mix languages.
When not interested: thank them politely and end the call graciously.
If they say thanks or goodbye, reply once briefly— the call may hang up automatically after your sign-off.

IMPORTANT: Keep each response under 35 words for low latency voice output. No markdown or bullet lists—spoken words only.`;

const END_SIGNALS = [
  'goodbye',
  'bye',
  'not interested',
  "i'll think about it",
  'call me later',
  'no thank you',
  'not now',
  'have a good day',
  'talk to you later',
  'thank you for your time',
  'thanks for your time',
  "you're welcome",
  'take care',
];

/** User said the conversation is over (short farewell) — skip another LLM turn and sign off + hang up. */
const USER_FAREWELL_RE = new RegExp(
  [
    '^\\s*(thank you|thanks|thankyou)[,!\\.\\s]*$',
    '^\\s*(ok|okay|alright),?\\s+(thank you|thanks|bye)\\b',
    '\\b(bye|goodbye|talk to you later|have a good (day|one))\\b',
    '^\\s*(namaste|chalo|chaliye)\\b.*\\b(bye|thanks)',
  ].join('|'),
  'i'
);

/** True when OpenAI is configured. */
export function hasLlmConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Non-secret summary for logs and /health. */
export function getLlmRuntimeSummary(): { provider: 'openai'; model: string } {
  return { provider: 'openai', model: (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() };
}

/** OpenAI chat expects system + alternating user/assistant; fold leading assistant turns into system context. */
function buildOpenAiMessages(history: Message[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  let i = 0;
  const leadingAssistant: string[] = [];
  while (i < history.length && history[i].role === 'assistant') {
    leadingAssistant.push(history[i].content);
    i += 1;
  }
  const rest = history.slice(i);
  let systemContent = SYSTEM_PROMPT;
  if (leadingAssistant.length > 0) {
    systemContent += `\n\nYou have already said to the caller: ${leadingAssistant.join(' ')}`;
  }
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: 'system', content: systemContent }];
  for (const m of rest) {
    out.push({ role: m.role, content: m.content });
  }
  if (out.length < 2) {
    throw new Error('OpenAI: no user messages after system');
  }
  const last = rest[rest.length - 1];
  if (last.role !== 'user') {
    throw new Error('Expected last message to be user turn');
  }
  return out;
}

/** Emit first complete sentence ASAP (`. ` / `? ` / `! `) for lower time-to-first-TTS. */
function takeFirstSentence(buf: string): { sentence: string; rest: string } | null {
  let bestIdx = -1;
  let bestSepLen = 2;
  for (const sep of ['. ', '? ', '! ']) {
    const i = buf.indexOf(sep);
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) {
      bestIdx = i;
      bestSepLen = sep.length;
    }
  }
  if (bestIdx < 0) return null;
  return {
    sentence: buf.slice(0, bestIdx + 1).trim(),
    rest: buf.slice(bestIdx + bestSepLen),
  };
}

async function streamOpenAi(
  history: Message[],
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const client = new OpenAI({ apiKey });
  const messages = buildOpenAiMessages(history);

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  let fullResponse = '';
  let buffer = '';

  for await (const part of stream) {
    const text = part.choices[0]?.delta?.content ?? '';
    buffer += text;
    fullResponse += text;

    let chunk: { sentence: string; rest: string } | null;
    while ((chunk = takeFirstSentence(buffer))) {
      buffer = chunk.rest;
      if (chunk.sentence) await onChunk(chunk.sentence);
    }
  }

  if (buffer.trim()) {
    await onChunk(buffer.trim());
  }

  return fullResponse;
}

const emptySummary = (): CallSummary => ({
  text: '',
  outcome: 'unknown',
  appointment_requested: false,
  proposed_appointment_iso: null,
});

export const conversationEngine = {
  async streamResponse(
    history: Message[],
    onChunk: (chunk: string) => Promise<void>
  ): Promise<string> {
    return streamOpenAi(history, onChunk);
  },

  shouldEndCall(responseText: string): boolean {
    const lower = responseText.toLowerCase();
    return END_SIGNALS.some(signal => lower.includes(signal));
  },

  /** Caller is clearly closing (thanks / bye) — use after ≥1 full exchange so we don’t eat “not interested”. */
  userSignalsCallEnd(userText: string): boolean {
    const t = userText.trim();
    if (t.length > 120) return false;
    const lower = t.toLowerCase();
    if (
      /^(no thanks?|not interested|don'?t call|stop calling|remove me)/i.test(t) &&
      !/\b(bye|goodbye|thank)/i.test(t)
    ) {
      return false;
    }
    return USER_FAREWELL_RE.test(lower);
  },

  async summarizeCall(history: Message[]): Promise<CallSummary> {
    const transcript = history.map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`).join('\n');

    const prompt = `Analyze this sales call transcript and respond with ONLY a JSON object:
{
  "summary": "2-3 sentence summary of the call",
  "outcome": "interested|not_interested|callback|appointment_booked|unknown",
  "appointment_requested": true|false,
  "proposed_appointment_iso": null
}

Rules for proposed_appointment_iso:
- If the customer clearly agreed to a specific date AND clock time, set this to ISO 8601 with timezone offset (use Asia/Kolkata IST +05:30 for Indian prospects unless the transcript states another zone). Example: "2026-04-20T12:00:00+05:30" for 12:00 noon local.
- If they only said "tomorrow" without a time, or "next week", or no concrete slot, use null.
- Never invent a time that was not discussed.

Transcript:
${transcript}`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return emptySummary();

    try {
      const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
      const client = new OpenAI({ apiKey });
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      const text = res.choices[0]?.message?.content?.trim() ?? '';
      if (text) {
        const parsed = JSON.parse(text);
        const iso =
          typeof parsed.proposed_appointment_iso === 'string' && parsed.proposed_appointment_iso.trim()
            ? parsed.proposed_appointment_iso.trim()
            : null;
        const out = {
          text: parsed.summary || '',
          outcome: parsed.outcome || 'unknown',
          appointment_requested: Boolean(parsed.appointment_requested),
          proposed_appointment_iso: iso,
        };
        console.log(
          `[conversationEngine.summarize] openai ok outcome=${out.outcome} appointment_requested=${out.appointment_requested} proposed_iso=${iso ? 'yes' : 'no'}`
        );
        return out;
      }
    } catch (err: any) {
      console.error('[conversationEngine.summarize]', err.message);
    }
    return emptySummary();
  },
};
