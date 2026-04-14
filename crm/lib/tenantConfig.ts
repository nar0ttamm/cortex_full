/**
 * Default tenant UUID for single-tenant CRM builds.
 * Env values are trimmed — accidental trailing spaces break Postgres uuid columns.
 */
export const DEFAULT_TENANT_ID = (
  process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'b50750c7-0a91-4cd4-80fa-8921f974a8ec'
).trim();
