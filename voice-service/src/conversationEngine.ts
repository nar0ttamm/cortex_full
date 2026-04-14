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

const SYSTEM_PROMPT = `You are an Indian sales executive on a live phone call (CortexFlow CRM).

Style & language:
- Sound natural, warm, confident — like a real telesales rep in India.
- Use Hinglish: mix Hindi and English the way professionals do on calls (short Hindi phrases + English business words).
- Keep each reply VERY short: about 5–12 words only. Never long paragraphs or bullet lists.
- Prefer quick follow-up questions over monologues.

Goals:
1. Greet, confirm you have the right person, build quick rapport.
2. Qualify need in one tight question at a time.
3. If interested, offer callback / appointment in simple words.
4. If not interested, thank them and close politely.

Latency: prioritize speed — shorter beats perfect. One breath per turn.`;

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
        const seps = ['. ', '? ', '! ', '\n'];
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
