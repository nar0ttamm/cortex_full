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

  // Public URL of this backend (used in Exotel callback URLs)
  backendUrl: e(process.env.BACKEND_URL) || 'http://localhost:4000',

  // Default tenant for single-tenant dev mode
  defaultTenantId: e(process.env.DEFAULT_TENANT_ID) || 'b50750c7-0a91-4cd4-80fa-8921f974a8ec',

  // Admin notifications
  adminEmail: e(process.env.ADMIN_EMAIL) || 'cortexflowagent@gmail.com',
  adminPhone: e(process.env.ADMIN_PHONE) || '+917021433461',

  // Admin auth token for /v1/admin/* routes
  adminToken: e(process.env.ADMIN_TOKEN) || null,

  // Cron job secret (Vercel sets this automatically)
  cronSecret: e(process.env.CRON_SECRET) || null,
};
