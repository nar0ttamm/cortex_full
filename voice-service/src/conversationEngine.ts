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

/** Returns "Wednesday, 20 April 2026 — 14:32 IST" style string in Asia/Kolkata timezone. */
function getCurrentIstDateString(): string {
  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${dateStr} — ${timeStr} IST`;
  } catch {
    return new Date().toISOString();
  }
}

function buildSystemPrompt(opts?: { leadName?: string; leadInquiry?: string }): string {
  const name = opts?.leadName?.trim();
  const inquiry = opts?.leadInquiry?.trim();

  let leadCtx = '';
  if (name) leadCtx += `\nYou are calling ${name}.`;
  if (inquiry) leadCtx += `\nThey previously enquired about: "${inquiry}". Use this as the conversation starting point.`;

  return `You are a friendly, professional AI sales assistant calling on behalf of a business using CortexFlow CRM.${leadCtx}

Your role:
1. Confirm the prospect is available to talk (ask if it's a good time)
2. Reference their inquiry if known, or briefly explain how the business can help
3. Ask 1-2 qualifying questions about their needs
4. If interested, offer to book an appointment — get a SPECIFIC day and time from them
5. Keep each response to 1-2 short sentences maximum — phone conversation pace
6. Be warm, natural, and never robotic. Mix Hinglish if they do.
7. Wrap up graciously when they say goodbye or thanks

Current date and time: ${getCurrentIstDateString()}

Scheduling rules (CRITICAL):
- When booking: ask for day AND clock time explicitly. Say it back to confirm ("So I'll book you for tomorrow at 1 PM IST — does that work?")
- Use today's date above to compute exact future ISO dates
- Once they confirm a slot, say "Perfect, I've noted it — you'll see it on the calendar" and close the call
- NEVER ask for more than one thing per turn

IMPORTANT: Max 30 words per response. Spoken words only — no markdown, no bullet points.`;
}

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
function buildOpenAiMessages(history: Message[], leadCtx?: { leadName?: string; leadInquiry?: string }): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  let i = 0;
  const leadingAssistant: string[] = [];
  while (i < history.length && history[i].role === 'assistant') {
    leadingAssistant.push(history[i].content);
    i += 1;
  }
  const rest = history.slice(i);
  let systemContent = buildSystemPrompt(leadCtx);
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

/** True for transient network errors worth a single retry. */
function isRetryableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message.toLowerCase() : String(e).toLowerCase();
  return (
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('network error') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed')
  );
}

async function streamOpenAiAttempt(
  history: Message[],
  onChunk: (chunk: string) => Promise<void>,
  leadCtx?: { leadName?: string; leadInquiry?: string }
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  const client = new OpenAI({ apiKey });
  const messages = buildOpenAiMessages(history, leadCtx);

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    max_tokens: 120,
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

async function streamOpenAi(
  history: Message[],
  onChunk: (chunk: string) => Promise<void>,
  leadCtx?: { leadName?: string; leadInquiry?: string }
): Promise<string> {
  try {
    return await streamOpenAiAttempt(history, onChunk, leadCtx);
  } catch (e) {
    if (isRetryableError(e)) {
      console.warn('[conversationEngine] LLM transient error, retrying once:', e instanceof Error ? e.message : e);
      await new Promise(r => setTimeout(r, 800));
      return await streamOpenAiAttempt(history, onChunk, leadCtx);
    }
    throw e;
  }
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
    onChunk: (chunk: string) => Promise<void>,
    leadCtx?: { leadName?: string; leadInquiry?: string }
  ): Promise<string> {
    return streamOpenAi(history, onChunk, leadCtx);
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
    const callDate = getCurrentIstDateString();

    const prompt = `Analyze this sales call transcript and respond with ONLY a JSON object:
{
  "summary": "2-3 sentence summary of the call",
  "outcome": "interested|not_interested|callback|appointment_booked|unknown",
  "appointment_requested": true|false,
  "proposed_appointment_iso": null
}

The call happened on: ${callDate}
Rules for proposed_appointment_iso:
- If the customer clearly agreed to a specific date AND clock time, calculate the exact future date from the call date above. Set this to ISO 8601 with timezone offset +05:30. Example: if they said "tomorrow at 1 PM" and the call was on Monday 20 April 2026, set "2026-04-21T13:00:00+05:30".
- "12 noon" or "twelve PM" = 12:00. "12 midnight" or "twelve AM" = 00:00 next calendar day.
- If they only said "tomorrow" without a time, or "next week", or no concrete slot, use null.
- Never invent a time that was not discussed. The date must be strictly in the future relative to the call time.

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
