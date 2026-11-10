# API reference

Base URL in production is the Vercel project `cortex-backend-api` at `https://cortex-backend-api.vercel.app`. Routes are mounted in `backend/server.js`.

Auth words:

- **JWT** — `requireUser` in `backend/middleware/auth.js`. Supabase `GET /auth/v1/user`, then `user_profiles`. A claimed `tenant_id` must match.
- **Voice** — header `x-voice-secret` equals `VOICE_SECRET`.
- **Cron** — bearer `CRON_SECRET`, or the voice secret.
- **Admin** — header `x-admin-token` or bearer equals `ADMIN_TOKEN`.
- **Public** — `isPublicPath` skips JWT. Some public routes then check a secret. Some do not.

Request and response bodies are JSON unless noted. Errors use `{ error: string }` from the global handler, which returns `err.message`.

## Session and health

| Method | Path | Auth | Behavior | File |
|---|---|---|---|---|
| GET | `/health` | Public | `SELECT 1`. 200 `{status, database}` or 500 with `error` | `server.js` |
| GET | `/v1/me` | JWT | `{userId, email, tenantId, role}` | `server.js` |

## Leads — `backend/routes/leads.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/v1/lead/ingest` | JWT | Requires tenant_id, name, phone. Dedupe on `(tenant_id, phone)`. Resolves project. Inserts lead. Enqueues unless project is unresolved. Fires notifications. |
| GET | `/v1/leads/:tenantId` | JWT | List for the session tenant. Joins `lead_context` score fields. |
| GET | `/v1/leads/:tenantId/:leadId` | JWT | One lead. |
| GET | `/v1/leads/by-phone/:tenantId/:phone` | JWT | Lookup. Declared after `/:leadId`, so Express can treat `by-phone` as a tenant id. Do not add clients on this path until the order is fixed. |
| PATCH | `/v1/leads/:leadId` | JWT | status, metadata, project_id, assigned_to. Tenant from the session. |
| POST | `/v1/lead/status` | JWT | Status change plus history inside metadata. |
| POST | `/v1/leads/:leadId/notes` | JWT | Appends `{id, text, ...}` onto `metadata.notes`. |
| DELETE | `/v1/leads/:leadId/notes/:noteId` | JWT | Removes one note from that array. |
| POST | `/v1/lead/metadata` | JWT | Metadata merge. |
| GET | `/v1/analytics/conversion` | JWT | Aggregates from `conversionAnalytics.js`. |

## Calls — `backend/routes/newCalls.js` and `calls.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/v1/calls/start` | JWT, in-memory 20/min | `startOutboundCall`. |
| POST | `/v1/calls/result` | Public + voice | Idempotent result. Updates lead, transcript, score, queue, optional appointment. |
| GET | `/v1/calls/:tenantId/summary` | JWT | `COUNT(*)` of the tenant's calls, plus active count. |
| GET | `/v1/calls/:tenantId` | JWT | List joined to transcripts. `limit` query is not capped. |
| POST | `/v1/call/event` | JWT | Legacy event insert into `call_events`. |
| POST | `/v1/call/simulate` | JWT | Legacy simulator. Still mounted. |

## Voice tools — `backend/routes/callTools.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/v1/calls/tools/search-products` | Public prefix + voice | `productSelector` / `kb_products`. |
| GET | `/v1/calls/tools/product/:productId` | Voice | One active product, tenant and project checked. |
| POST | `/v1/calls/tools/update-lead-memory` | Voice | Writes `lead_context`. |
| POST | `/v1/calls/tools/log-analytics` | Voice | Inserts `call_analytics`. |
| GET | `/v1/calls/analytics` | JWT | Read analytics. |
| GET | `/v1/calls/usage/:tenantId` | JWT | `tenant_usage`. |

## Voice process — `pipecat-server/server.py`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/voice/start-call` | `x-voice-secret`, else 503 | Capacity check, Telnyx dial. 502 if Telnyx throws. |
| POST | `/telnyx-webhook` | Ed25519 if `TELNYX_PUBLIC_KEY` is set. If the key is missing, verification returns true. `TELNYX_WEBHOOK_ENFORCE=false` accepts bad signatures. | `call.answered` starts media. |
| WS | `/ws` | No shared secret | Telnyx media. Bot handshake can return without starting a model. |
| GET | `/health` | Public | Booleans for which env vars are non-empty, plus the configured caller ID and domain. |

## Internal — `backend/routes/internal.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET, POST | `/v1/internal/queue-worker` | Cron | `runQueueWorker` |
| GET, POST | `/v1/internal/process-pending-calls` | Cron | Same function |
| GET, POST | `/v1/internal/process-reminders` | Cron | `runReminderJob` |

## Appointments — `backend/routes/appointments.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/v1/appointment/schedule` | JWT | Insert appointment and lead metadata. |
| POST | `/v1/appointment/update` | JWT | Status / time update. |
| GET | `/v1/appointments/:tenantId` | JWT | List. |

## Credentials and tenant — `backend/routes/credentials.js`, `admin.js`

| Method | Path | Auth | Behavior |
|---|---|---|---|
| GET | `/v1/credentials/:tenantId/:service` | JWT, any role | Returns **decrypted** credential JSON. |
| POST | `/v1/admin/credentials` | Admin | Encrypt and upsert. |
| DELETE | `/v1/admin/credentials/:tenantId/:service` | Admin | Delete row. |
| POST | `/v1/admin/tenant` | Admin | Create tenant by name and slug. |
| GET | `/v1/tenant/:tenantId` | JWT, any role | Read tenant. |
| PATCH | `/v1/tenant/:tenantId` | JWT, any role | Update name and settings JSON. |

## Projects, teams, users

`backend/routes/projects.js`: GET/POST `/v1/projects`, GET/PATCH `/v1/projects/:id`, GET/POST/PATCH `/v1/teams`, members GET/POST/DELETE. Team writes check `req.role` in `admin` or `manager`.

`backend/routes/users.js`: GET `/v1/users`, GET `/v1/users/me`, POST `/v1/users/create` (admin or manager, Supabase admin API), PATCH `/v1/users/:userId`.

`backend/routes/knowledgeBase.js`: GET/POST `/v1/kb`, PATCH `/v1/kb/:id`, GET/POST `/v1/kb/products`, PATCH/DELETE `/v1/kb/products/:id`.

`backend/routes/activityLogs.js`: GET/POST `/v1/activity`.

`backend/routes/notifications.js`: POST `/v1/notifications/send`.

## Webhooks and OAuth

| Method | Path | Auth | Behavior | File |
|---|---|---|---|---|
| POST | `/v1/webhook/:tenantId/:integrationKey` | Public. HMAC or bearer if `webhook_secret` is set. **Null secret is allow.** | Normalize and ingest | `integrations.js` |
| GET | `/v1/webhook/:tenantId/:integrationKey` | Public. Echoes `hub.challenge` with **no verify token** | Challenge | same |
| GET | `/v1/integrations/supported` | JWT | Catalog | same |
| GET, POST, DELETE | `/v1/integrations/:tenantId...` | JWT | CRUD, regenerate secret, logs, test | same |
| GET | `/v1/meta/auth` | JWT | OAuth start | `metaIntegration.js` |
| GET | `/v1/meta/callback` | Public prefix | OAuth return | same |
| GET | `/v1/meta/webhook` | Public. Compares `META_WEBHOOK_VERIFY_TOKEN` | Meta subscribe | same |
| POST | `/v1/meta/webhook` | Public. **No X-Hub-Signature.** Responds 200 first | Leadgen | same |
| GET, DELETE | `/v1/meta/status`, `/v1/meta/disconnect` | JWT | | same |
| GET | `/v1/google-calendar/auth` | JWT | OAuth start | `googleCalendar.js` |
| GET | `/v1/google-calendar/callback` | Public prefix | Stores tokens | same |
| GET, POST, DELETE | status, create-event, disconnect | JWT | Calendar | same |
| GET, POST | `/v1/email/inbound` | Public. No Resend signature | Attaches reply to the latest lead with that email, any tenant. Response includes lead name | `email.js` |
| POST | `/v1/demo/request` | Public. In-memory 5/hour/IP | Creates a demo lead and dials | `demo.js` |
| POST | `/v1/demo/whatsapp-interaction` | Public | Demo flag update | `demo.js` |

## CRM route handlers

These live in `crm/app/api/` and are a second surface. Middleware does not protect `/api`.

| Path | Behavior | File |
|---|---|---|
| POST `/api/onboarding/complete` | Service role upsert of tenant, profile, default team | `onboarding/complete/route.ts` |
| POST `/api/import` | CSV parse, then `POST /v1/lead/ingest` per row | `import/route.ts` |
| GET `/api/me` | Session | `me/route.ts` |
| GET `/api/stats` | Stats helper | `stats/route.ts` |
| GET `/api/activity` | Activity proxy | `activity/route.ts` |
| GET `/api/crm-data` | CRM bundle | `crm-data/route.ts` |
| `/api/leads/[leadId]` and notes | Proxies to Express with the user token | lead route files |
| POST `/api/auth/logout` | Supabase sign-out | `auth/logout/route.ts` |
| GET `/api/auth/callback` | `exchangeCodeForSession` | `auth/callback/route.ts` |

No Google Ads route exists. Google Lead Forms is only a row in `integration_sources`.
