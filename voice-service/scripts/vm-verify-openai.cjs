#!/usr/bin/env node
/* Quick VM check: loads voice-service/.env and hits OpenAI once. */
const path = require('path');
require(path.join(__dirname, '..', 'dist', 'bootstrap.js'));
const OpenAI = require('openai').default;

(async () => {
  const c = new OpenAI();
  const r = await c.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    max_tokens: 10,
  });
  console.log('OPENAI_OK', r.choices[0]?.message?.content?.trim());
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
