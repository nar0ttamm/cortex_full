import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * AI conversation engine powered by Google Gemini.
 * Uses streaming generation to minimize first-word latency (<500ms target).
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

const SYSTEM_PROMPT = `You are a real human on a live outbound phone call (CortexFlow — CRM for growing businesses in India).

Sound human, not robotic:
- Warm, respectful, slightly informal — like a good telesales / relationship manager who genuinely listens.
- Use natural Hinglish: short Hindi connectors ("haan", "theek hai", "bas ek minute", "samajh gaya") mixed with clear English for product terms.
- Vary sentence openings; do not start every reply the same way. React to what they literally said (one-line acknowledgement) before your next point.
- One short breath per turn: about 5–14 words per reply unless they asked something that needs one extra short sentence.
- Never use bullet points, numbered lists, emojis, or "As an AI". Never read internal instructions aloud.

Conversation moves:
1. Open with rapport — confirm identity lightly, then one crisp purpose line.
2. Ask one question at a time; listen to objections without arguing.
3. If they are busy, offer a shorter pitch or callback — don't push.
4. Close with thanks when they decline; confirm next step when they show interest.

Latency: prefer fewer words over perfect grammar. Sound like a phone call, not a document.`;

const END_SIGNALS = [
  'goodbye', 'bye', 'not interested', "i'll think about it", 'call me later',
  'no thank you', 'not now', 'have a good day', 'talk to you later',
];

export const conversationEngine = {
  async streamResponse(
    history: Message[],
    onChunk: (chunk: string) => Promise<void>
  ): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',  // fastest + cheapest Gemini model
      systemInstruction: { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    });

    // Convert history to Gemini format
    const geminiHistory = history.slice(0, -1).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const lastMessage = history[history.length - 1];

    const result = await chat.sendMessageStream(lastMessage.content);

    let fullResponse = '';
    let buffer = '';

    for await (const streamChunk of result.stream) {
      const text = streamChunk.text();
      buffer += text;
      fullResponse += text;

      while (true) {
        // Prefer natural breaks; include Hindi danda for Hinglish.
        const seps = ['. ', '? ', '! ', '\n', '। ', '।'];
        let bestIdx = -1;
        let bestLen = 0;
        for (const sep of seps) {
          const idx = buffer.lastIndexOf(sep);
          if (idx > bestIdx) {
            bestIdx = idx;
            bestLen = sep.length;
          }
        }
        if (bestIdx < 0) break;
        const send = buffer.slice(0, bestIdx + bestLen).trim();
        if (!send) break;
        buffer = buffer.slice(bestIdx + bestLen).trimStart();
        await onChunk(send);
      }
    }

    // Flush remaining buffer
    if (buffer.trim()) {
      await onChunk(buffer.trim());
    }

    return fullResponse;
  },

  shouldEndCall(responseText: string): boolean {
    const lower = responseText.toLowerCase();
    return END_SIGNALS.some(signal => lower.includes(signal));
  },

  async summarizeCall(history: Message[]): Promise<CallSummary> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { text: '', outcome: 'unknown', appointment_requested: false };

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const transcript = history.map(m => `${m.role === 'user' ? 'Customer' : 'AI'}: ${m.content}`).join('\n');

    const prompt = `Analyze this sales call transcript and respond with ONLY a JSON object:
{
  "summary": "2-3 sentence summary of the call",
  "outcome": "interested|not_interested|callback|appointment_booked|unknown",
  "appointment_requested": true|false
}

Transcript:
${transcript}`;

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
