// Central environment configuration
// All env var access goes through here — no scattered process.env across files

// Trim all string env vars — prevents newline contamination from CLI piping
const e = (val) => (val || '').trim() || undefined;

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),

  // Supabase / DB
  databaseUrl: e(process.env.DATABASE_URL),

  // Encryption
  encryptionKey: e(process.env.ENCRYPTION_KEY),

  // Calling
  callingMode: e(process.env.CALLING_MODE) || 'simulated', // 'simulated' | 'live'
  callDelaySeconds: parseInt(process.env.CALL_DELAY_SECONDS || '120', 10),

  // Public URL of this backend (used in webhook/callback URLs)
  backendUrl: e(process.env.BACKEND_URL) || 'http://localhost:4000',

  // Default tenant for the public demo only. Never fall back to a baked-in tenant id.
  defaultTenantId: e(process.env.DEFAULT_TENANT_ID) || null,

  // Admin notifications. Tenant settings override these. No personal fallback.
  adminEmail: e(process.env.ADMIN_EMAIL) || null,
  adminPhone: e(process.env.ADMIN_PHONE) || null,

  // Admin auth token for /v1/admin/* routes
  adminToken: e(process.env.ADMIN_TOKEN) || null,

  // Cron job secret (Vercel sets this automatically)
  cronSecret: e(process.env.CRON_SECRET) || null,

  // cortex_voice service
  voiceServiceUrl: e(process.env.VOICE_SERVICE_URL) || null,
  voiceSecret: e(process.env.VOICE_SECRET) || null,

  // OpenAI — post-call transcript analysis (fallback when tenant has no `openai` credentials row)
  openAiApiKey: e(process.env.OPENAI_API_KEY),
  openAiModel: e(process.env.OPENAI_MODEL) || 'gpt-4o-mini',

  // Google OAuth (Phase 6 — Google Calendar)
  googleClientId: e(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: e(process.env.GOOGLE_CLIENT_SECRET),
  googleRedirectUri: e(process.env.GOOGLE_REDIRECT_URI),

  // Meta OAuth (Phase 8 — Meta Lead Ads)
  metaAppId: e(process.env.META_APP_ID),
  metaAppSecret: e(process.env.META_APP_SECRET),
  metaWebhookVerifyToken: e(process.env.META_WEBHOOK_VERIFY_TOKEN),

  inboundWebhookSecret: e(process.env.INBOUND_WEBHOOK_SECRET) || null,
  msg91AuthKey: e(process.env.MSG91_AUTH_KEY) || null,
  msg91EmailDomain: e(process.env.MSG91_EMAIL_DOMAIN) || null,
  msg91EmailFrom: e(process.env.MSG91_EMAIL_FROM) || null,
  msg91EmailFromName: e(process.env.MSG91_EMAIL_FROM_NAME) || 'CortexFlow',
  msg91EmailReplyTo: e(process.env.MSG91_EMAIL_REPLY_TO) || null,
  msg91WhatsappNumber: e(process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER) || null,
  msg91WhatsappLanguage: e(process.env.MSG91_WHATSAPP_LANGUAGE) || 'en',
  msg91WebhookSecret: e(process.env.MSG91_WEBHOOK_SECRET) || null,

  // Supabase admin (Phase 5 — user creation)
  supabaseUrl: e(process.env.NEXT_PUBLIC_SUPABASE_URL) || e(process.env.SUPABASE_URL),
  supabaseServiceKey: e(process.env.SUPABASE_SERVICE_ROLE_KEY),

  // CRM URL (for OAuth redirects)
  crmUrl: e(process.env.CRM_URL) || 'https://crm.cortexflow.in',
};
