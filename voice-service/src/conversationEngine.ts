import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * AI conversation engine: Gemini or OpenAI, streaming for low first-word latency.
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface CallSummary {
  text: string;
  outcome: 'interested' | 'not_interested' | 'callback' | 'appointment_booked' | 'unknown';
  appointment_requested: boolean;
}

const SYSTEM_PROMPT = `You are a friendly and professional AI sales assistant for a business using CortexFlow CRM.
Your role is to:
1. Warmly greet the prospect and confirm their interest
2. Briefly explain how the business can help them
3. Ask qualifying questions about their needs
4. If interested, offer to schedule an appointment or callback
5. Keep responses SHORT — 1-3 sentences max per turn, like a real phone conversation
6. Be natural, empathetic, and never robotic
7. Detect when the conversation is naturally ending and wrap up politely

When the prospect wants to schedule: confirm their preferred time and mention they'll receive a confirmation.
When not interested: thank them politely and end the call graciously.

IMPORTANT: Keep each response under 40 words for low latency voice output.`;

const END_SIGNALS = [
  'goodbye', 'bye', 'not interested', "i'll think about it", 'call me later',
  'no thank you', 'not now', 'have a good day', 'talk to you later',
];

function getEffectiveLlmProvider(): 'openai' | 'gemini' {
  const explicit = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'openai') return 'openai';
  if (explicit === 'gemini') return 'gemini';
  if (process.env.OPENAI_API_KEY?.trim() && !process.env.GEMINI_API_KEY?.trim()) return 'openai';
  return 'gemini';
}

/** True when the configured LLM provider has an API key. */
export function hasLlmConfigured(): boolean {
  const p = getEffectiveLlmProvider();
  if (p === 'openai') return Boolean(process.env.OPENAI_API_KEY?.trim());
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

/**
 * Gemini `startChat` history must start with role `user`, not `model`.
 * Our pipeline prepends the spoken greeting as `assistant` first — strip that prefix for the API.
 */
function trimHistoryForGeminiChat(history: Message[]): Message[] {
  let i = 0;
  while (i < history.length && history[i].role === 'assistant') i += 1;
  return history.slice(i);
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

    const sentenceEnd = buffer.lastIndexOf('. ');
    if (sentenceEnd > 0) {
      const sentence = buffer.slice(0, sentenceEnd + 1).trim();
      if (sentence) await onChunk(sentence);
      buffer = buffer.slice(sentenceEnd + 2);
    }
  }

  if (buffer.trim()) {
    await onChunk(buffer.trim());
  }

  return fullResponse;
}

async function streamGemini(
  history: Message[],
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelId = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
  });

  const trimmed = trimHistoryForGeminiChat(history);
  if (trimmed.length === 0) {
    throw new Error('No messages after trimming assistant-only prefix');
  }
  const lastMessage = trimmed[trimmed.length - 1];
  if (lastMessage.role !== 'user') {
    throw new Error('Expected last message to be user turn');
  }

  const geminiHistory = trimmed.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });

  const result = await chat.sendMessageStream(lastMessage.content);

  let fullResponse = '';
  let buffer = '';

  for await (const chunk of result.stream) {
    const text = chunk.text();
    buffer += text;
    fullResponse += text;

    const sentenceEnd = buffer.lastIndexOf('. ');
    if (sentenceEnd > 0) {
      const sentence = buffer.slice(0, sentenceEnd + 1).trim();
      if (sentence) await onChunk(sentence);
      buffer = buffer.slice(sentenceEnd + 2);
    }
  }

  if (buffer.trim()) {
    await onChunk(buffer.trim());
  }

  return fullResponse;
}

export const conversationEngine = {
  async streamResponse(
    history: Message[],
    onChunk: (chunk: string) => Promise<void>
  ): Promise<string> {
    const provider = getEffectiveLlmProvider();
    if (provider === 'openai') {
      return streamOpenAi(history, onChunk);
    }
    return streamGemini(history, onChunk);
  },

  shouldEndCall(responseText: string): boolean {
    const lower = responseText.toLowerCase();
    return END_SIGNALS.some(signal => lower.includes(signal));
  },

  async summarizeCall(history: Message[]): Promise<CallSummary> {
    const transcript = history.map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`).join('\n');

    const prompt = `Analyze this sales call transcript and respond with ONLY a JSON object:
{
  "summary": "2-3 sentence summary of the call",
  "outcome": "interested|not_interested|callback|appointment_booked|unknown",
  "appointment_requested": true|false
}

Transcript:
${transcript}`;

    const provider = getEffectiveLlmProvider();

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return { text: '', outcome: 'unknown', appointment_requested: false };
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
          return {
            text: parsed.summary || '',
            outcome: parsed.outcome || 'unknown',
            appointment_requested: Boolean(parsed.appointment_requested),
          };
        }
      } catch (err: any) {
        console.error('[conversationEngine.summarize]', err.message);
      }
      return { text: '', outcome: 'unknown', appointment_requested: false };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { text: '', outcome: 'unknown', appointment_requested: false };

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelId = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
    const model = genAI.getGenerativeModel({ model: modelId });

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          text: parsed.summary || '',
          outcome: parsed.outcome || 'unknown',
          appointment_requested: parsed.appointment_requested || false,
        };
      }
    } catch (err: any) {
      console.error('[conversationEngine.summarize]', err.message);
    }

    return { text: '', outcome: 'unknown', appointment_requested: false };
  },
};
