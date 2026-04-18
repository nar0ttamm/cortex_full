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
 * Analyze a call transcript with OpenAI to extract lead intent.
 * Credentials: tenant row `service=openai` → `{ api_key, model? }`, else `OPENAI_API_KEY` on the server.
 *
 * Returns: { interested, confirmed_appointment, needs_info, callback_time, appointment_date, next_action }
 */
async function analyzeTranscript({ tenantId, transcript, lead }) {
  const config = require('../config');
  let apiKey;
  let model = config.openAiModel || 'gpt-4o-mini';

  try {
    const creds = await getCredentials(tenantId, 'openai');
    apiKey = creds.api_key;
    if (creds.model) model = creds.model;
  } catch {
    apiKey = config.openAiApiKey;
    if (!apiKey) {
      throw new Error(
        'OpenAI not configured: add credentials service=openai for this tenant or set OPENAI_API_KEY on the backend'
      );
    }
  }

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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You reply only with a single JSON object matching the user instructions.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    throw new Error(`OpenAI error: ${msg}`);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content?.trim() || '';

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn('[aiService] OpenAI returned non-JSON:', rawText);
    return fallbackAnalysis(rawText);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.warn('[aiService] OpenAI JSON parse failed:', jsonMatch[0]);
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
