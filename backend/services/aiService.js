const { getCredentials } = require('./credentialService');

/**
 * Transcribe a call recording URL using Deepgram.
 * Credentials shape: { api_key }
 */
async function transcribeCall({ tenantId, recordingUrl }) {
  const creds = await getCredentials(tenantId, 'deepgram');

  const res = await fetch(
    'https://api.deepgram.com/v1/listen?language=en-IN&model=nova-2&punctuate=true&smart_format=true',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${creds.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: recordingUrl }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Deepgram error: ${err.err_msg || res.statusText}`);
  }

  const data = await res.json();
  const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return transcript;
}

/**
 * Analyze a call transcript using Gemini to extract lead intent.
 * Credentials shape: { api_key }
 *
 * Returns: { interested, confirmed_appointment, needs_info, callback_time, appointment_date, next_action }
 */
async function analyzeTranscript({ tenantId, transcript, lead }) {
  const creds = await getCredentials(tenantId, 'gemini');

  const prompt = `You are a professional sales assistant analyzing a call transcript.

Lead Information:
Name: ${lead.name || 'Unknown'}
Phone: ${lead.phone || ''}
Inquiry: ${lead.inquiry || 'Not specified'}

Call Transcript:
${transcript}

Based on this conversation, analyze and respond ONLY in this exact JSON format (no extra text, no markdown):
{"interested":true,"confirmed_appointment":false,"needs_info":false,"callback_time":"","appointment_date":"","next_action":"follow_up"}

next_action options: "send_info", "schedule_callback", "confirm_appointment", "follow_up", "no_action"`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${creds.api_key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error: ${err.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Gemini sometimes wraps JSON in markdown code fences
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('[aiService] Gemini returned non-JSON:', rawText);
    return fallbackAnalysis(rawText);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('[aiService] Gemini JSON parse failed:', jsonMatch[0]);
    return fallbackAnalysis(rawText);
  }
}

function fallbackAnalysis(text) {
  const lower = text.toLowerCase();
  return {
    interested: lower.includes('interested') || lower.includes('yes'),
    confirmed_appointment: lower.includes('confirmed') || lower.includes('appointment'),
    needs_info: lower.includes('more info') || lower.includes('details'),
    callback_time: '',
    appointment_date: '',
    next_action: 'follow_up',
  };
}

module.exports = { transcribeCall, analyzeTranscript };
