# Security audit

Read-only. No exploit payloads were sent. No RLS policy was changed. No secret value is included.

## Tenant isolation

**Verified.** RLS is enabled on every `public` table and there are zero policies. `FORCE ROW LEVEL SECURITY` is off. `backend/db.js` connects with `DATABASE_URL`. That role is the table owner and bypasses RLS. The CRM onboarding route uses `SUPABASE_SERVICE_ROLE_KEY`, which also bypasses RLS.

`anon` and `authenticated` have `TRUNCATE` and full DML on all 24 tables. They are blocked only while RLS stays on and no permissive policy is added. The anon key is in the browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

Application filters are real on the routes that were read: lead and call queries include `tenant_id`, and `requireUser` rejects a mismatched claimed tenant. That is not the same as database enforcement. A missed `WHERE` is a cross-tenant read.

### Tables with `tenant_id`

tenants (the id itself), user_profiles, teams, projects, leads, lead_context, call_queue, calls, call_analytics, appointments, communications, credentials, knowledge_bases, kb_products, integrations, integration_logs, google_calendar_tokens, tenant_usage, activity_logs.

### Tables without `tenant_id`

`call_transcripts`, `call_events`, `team_members`, `integration_sources`, `demo_requests`.

Transcripts are safe only when the query starts from a tenant-scoped `calls` row. `GET /v1/calls/:tenantId` does that. A future route that loads `call_transcripts` by id alone would not.

### Cross-tenant paths that exist in code

| Path | Why |
|---|---|
| `POST /v1/email/inbound` | `SELECT ... FROM leads WHERE email = $1 ORDER BY created_at DESC LIMIT 1` with no tenant. Public. Response includes lead id and name |
| `POST /v1/webhook/:tenantId/:key` | Tenant id is in the URL. Allowed when `webhook_secret` is null |
| `POST /v1/meta/webhook` | Public, no signature. Tenant is chosen by matching `integrations.integration_key` |
| `GET /v1/credentials/:tenantId/:service` | Any role in the matching tenant receives decrypted secrets |
| `PATCH /v1/tenant/:tenantId` | Any role in the tenant can change settings |
| Users with no `user_profiles` row | `resolveTenantForUser` sets `tenantId` to the auth user id and `role` to `admin` |
| Voice tools | Protected by the shared `VOICE_SECRET`, not by a user. The secret holder can pass any tenant id |

## Authentication

Signup: `supabase.auth.signUp` in `crm/app/signup/page.tsx`, then `POST /api/onboarding/complete`. That route checks the session user id matches `body.userId`, then uses the service role to upsert the tenant and an admin profile.

Login: `signInWithPassword` in `crm/app/login/page.tsx`. Middleware `crm/middleware.ts` calls `getUser()`. If Supabase env is missing, middleware allows the request through.

JWT check: `requireUser` calls `{SUPABASE_URL}/auth/v1/user`. If the anon key is unset it sends `SUPABASE_SERVICE_ROLE_KEY` as `apikey`. That is a server-side fallback, not a browser exposure by itself.

Password recovery UI was not found beyond `/auth/callback`. Supabase advisor: leaked-password protection is disabled. https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Roles: `user_profiles.role` is `admin`, `manager`, or `executive`. Enforced in `routes/users.js` and some team mutations in `routes/projects.js`. Not enforced on leads, calls, tenant settings, or credential read.

## Credential exposure

| Store | Protection |
|---|---|
| `credentials.encrypted_data` | AES-256-CBC in `backend/encryption.js`. No auth tag, no key rotation. Key name `ENCRYPTION_KEY` |
| `GET /v1/credentials/...` | Decrypts and returns JSON to any tenant member |
| `integrations.webhook_secret` | Plaintext column |
| `google_calendar_tokens.access_token` and `refresh_token` | Plaintext. Table is empty |
| Vercel | Several variables are marked `readable-secret` by Vercel, including `DATABASE_URL`, `ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VOICE_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`, `ADMIN_TOKEN` on the backend, and `SUPABASE_SERVICE_ROLE_KEY` plus `RESEND_API_KEY` on the CRM. This audit did not open the values |
| `CRM_PASSWORD` | Name exists on the CRM project. No source reference found. Remove it from the dashboard when you next rotate, after confirming no old client reads it |

`ssl.rejectUnauthorized: false` in `db.js` disables certificate verification for Postgres.

## Webhooks and abuse

| Endpoint | Issue |
|---|---|
| `POST /v1/demo/request` | Public dial. Rate limit is a process-local `Map` keyed by the first `X-Forwarded-For` value (`backend/middleware/rateLimit.js`). It does not hold across Vercel isolates |
| `POST /v1/calls/start` | Same style of limiter, 20/min, and it does require JWT |
| Generic webhook GET | Returns `hub.challenge` without a token |
| Meta POST | No signature |
| Email inbound | No signature, cross-tenant match |
| Voice `/health` | Public, returns caller ID and domain |
| API `/health` | Public, returns exception text on DB failure |
| CORS | `server.js` allows `CRM_URL`, the two cortexflow.in origins, and any `*.vercel.app` |

## Consent and data rights

No consent flag is required before enqueue or dial. `pipecat-server/bot.py` `build_system_prompt` tells the model not to say it is an AI or CortexFlow. There is no opt-out list, no retention job, and no delete-account route. Transcripts sit in `call_transcripts` with no tenant column and no TTL.

Recording files are not stored. There is no storage bucket.

## What is in decent shape

- JWT is required on `/v1` except the public prefix list.
- Tenant mismatch returns 403 when the client sends another tenant id.
- CRM tenant resolution uses `user_profiles`, not `user_metadata.tenant_id` (`crm/lib/auth.ts`).
- Telnyx webhooks can be Ed25519-checked when `TELNYX_PUBLIC_KEY` is set and enforce is on.
- `/voice/start-call` refuses to run if `VOICE_SECRET` is empty.
- SQL that was read uses `$1` parameters.

## Release blockers

1. Queue re-enqueue. See `VOICE_PIPELINE_AUDIT.md`. It becomes toll fraud and harassment when Telnyx accepts calls.
2. RLS with owner bypass and `anon` `TRUNCATE`.
3. Decrypted credential GET for every role.
4. Unsigned email, Meta, and empty-secret webhooks.
5. Public demo dial.
