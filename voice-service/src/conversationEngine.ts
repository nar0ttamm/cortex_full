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

    for await (const chunk of result.stream) {
      const text = chunk.text();
      buffer += text;
      fullResponse += text;

      // Send complete sentences to TTS immediately for minimal latency
      const sentenceEnd = buffer.lastIndexOf('. ');
      if (sentenceEnd > 0) {
        const sentence = buffer.slice(0, sentenceEnd + 1).trim();
        if (sentence) await onChunk(sentence);
        buffer = buffer.slice(sentenceEnd + 2);
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
