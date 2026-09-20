# CortexFlow — system briefing for architecture discussion

**Audience:** another engineer or model (Claude, GPT, etc.) that has no prior context.  
**Purpose:** discuss product, architecture, and next work without guessing.  
**Date:** 20 September 2026  
**Method:** verified from the live repo, Vercel projects, Supabase schema, and the GCP Pipecat server. Not from stale manuals.  
**Do not treat `docs/FUNDABILITY_AUDIT.md` as current for auth.** That audit predates JWT `requireUser` on `/v1`. Use this file for runtime truth.

If you are an AI reading this: do not invent Stripe, inbound DID routing, SSO, GDPR export, or a working Telnyx number. Those are not live. Ask before proposing schema rewrites.

---

## 1. What the product is

CortexFlow is an **India-first AI outbound calling CRM**.

The intended loop:

1. A lead lands (ingest, CSV, webhook, or CRM UI).
2. Backend writes `leads` and enqueues `call_queue`.
3. A worker on the GCP voice VM polls the backend every 60s and dials via **Telnyx Call Control**.
4. **Pipecat** runs the conversation (Deepgram STT → OpenAI → ElevenLabs TTS).
5. Call result is persisted (`calls`, transcripts, lead status, optional appointment).
6. Humans work the rest in the CRM: pipeline, WhatsApp, email, appointments.

**Alive today** means: authenticated CRM → backend JWT → queue → Pipecat → Telnyx. Telnyx currently fails live dials (unverified / unpaid origination number `+14355009976`, error D51). Email works. WhatsApp needs Twilio sandbox. That is operational state, not architecture.

Positioning on the landing page (`cortexflow.in`): “AI calls every lead in under two minutes, qualifies, books the meeting, keeps WhatsApp / email / voice on one desk.”

---

## 2. Repo and runtime map

Monorepo: `nar0ttamm/cortex_full` (GitHub). Vercel team `team_9ZXW4upZVLTASrO9pzuXkG3J`.

| Surface | Path | Stack | Production |
|---|---|---|---|
| Landing | `landing/` | Next.js 15 | `https://cortexflow.in` / `www.cortexflow.in` (Vercel project `landing`) |
| CRM | `crm/` | Next.js 15 App Router | `https://crm.cortexflow.in` (Vercel project `crm`) |
| API | `backend/` | Express on `@vercel/node` | `https://cortex-backend-api.vercel.app` |
| Voice | `pipecat-server/` | FastAPI + Pipecat 0.0.108 | GCP VM `cortex-pipecat`, `https://34-180-6-84.nip.io` |
| Data | Supabase | Postgres + Auth | shared by CRM + backend via `DATABASE_URL` / service role |

There is **no** `supabase/` migrations folder in git. Schema lives in the hosted project. Backend talks to Postgres with the service connection string and **bypasses RLS**.

Hobby Vercel cron is daily only (`0 0 * * *` in `backend/vercel.json`). **Live queue processing is not Vercel cron.** The Pipecat process polls `GET /v1/internal/queue-worker` every 60 seconds.

---

## 3. Identity, tenancy, auth

### 3.1 Objects

```
auth.users                    Supabase Auth user (email/password)
   └── user_profiles          workspace membership
          tenant_id ────────► tenants          the company workspace
          role                admin | manager | executive
          position            free-text job title (not permissions)

tenants 1──* teams            sales group (people)
teams   1──* team_members     (team_id, user_profile_id) unique
teams   1──* projects         campaign / listing the AI sells
projects 1──* kb_products     pitch inventory for the agent
projects 1──* leads
leads   1──* call_queue, calls, communications, appointments, lead_context
```

**Source of truth for tenant:** `user_profiles.tenant_id`.  
**Do not use** `auth.users.raw_user_meta_data.tenant_id`. That field diverged and caused CRM `403 Tenant mismatch`.

Self-serve signup (`crm/app/signup` → `POST /api/onboarding/complete`): tenant `id` = auth `user.id`. The first admin is both the user and the tenant UUID. Invited users get a new `auth.users` row and a `user_profiles` row pointing at the **admin’s tenant id**, not their own user id.

### 3.2 Auth hops

1. Browser signs in with Supabase; session cookie on `crm.cortexflow.in`.
2. Next.js server routes (`/api/me`, `/api/stats`, …) call `getSession()` in `crm/lib/auth.ts` (cookies + service-role lookup of `user_profiles.tenant_id`).
3. Browser CRM pages that hit the Express API attach `Authorization: Bearer <supabase access token>` via `crm/lib/backendAuth.ts`.
4. Express `middleware/auth.js` `requireUser` validates the JWT against Supabase `/auth/v1/user`, then `resolveTenantForUser`. If the request also sends `tenantId` / `tenant_id` and it does not match, **403 Tenant mismatch**.

Public (no user JWT): `/health`, `/v1/webhook/*`, `/v1/demo/*`, `/v1/calls/result`, `/v1/calls/tools`, `/v1/internal/*`, inbound email, Meta/Google OAuth callbacks. Internal/voice still require `x-voice-secret` or `CRON_SECRET` in production (fail closed).

Workspace roles: admin and manager may create teams and people. Executives should not. Enforcement is now on those POST routes; it is **not** applied to every CRM screen yet.

---

## 4. Team vs project (current intended model)

This was the confusing admin flow. The intended model after the 20 Sep 2026 cleanup:

| Thing | Meaning | Who creates it |
|---|---|---|
| **Workspace (tenant)** | The company. Settings, billing plan string, call delay. | Signup / onboarding |
| **Team** | A group of people (Mumbai sales, admissions desk). First-class. | Team page → New team. Signup now seeds `{company} team` and adds the admin as manager. |
| **Person** | Login + workspace role + optional team membership. | Team page → Add person (`POST /v1/users/create` via Supabase Admin API) |
| **Project** | A campaign or listing. Optional `team_id`. Optional `kb_products`. | Header “New project” / Projects page. Two-step wizard: details, then team. CSV import is **not** part of create — use Data / Integrations after. |

UI:

- `/team` — explainer, create team, add people, team detail (members + projects).
- `/projects` — list campaigns; create via existing header wizard.
- Wizard no longer has four steps, fake CSV upload, or “create a project to get a team.”

APIs (`backend/routes/projects.js` + `users.js`):

- `GET/POST /v1/teams`, `GET/PATCH /v1/teams/:id`
- `GET/POST/DELETE /v1/teams/:id/members`
- `GET/POST /v1/projects`, `GET/PATCH /v1/projects/:id`
- Creating a team adds the creator (and optional manager) to `team_members`.
- Creating a project with `newTeamName` also adds the creator to that team.
- `GET /v1/users` aggregates team names (no duplicate rows if someone is on multiple teams).

**Still true / still incomplete:**

- Teams do not yet gate which leads a non-admin sees. Most list queries are tenant-wide.
- `leads.assigned_to` exists; the UI does not drive it from team membership.
- `user_profiles.role` (workspace) vs `team_members.role` (manager/executive on that team) are different columns. The UI now labels them separately; older screens may still say “role” for both.

---

## 5. Backend (Express)

Entry: `backend/server.js`. Config: `backend/config/index.js`. DB pool: `backend/db.js` (`max: 1` because Vercel serverless).

Mounted under `/v1` (all JWT unless public):

| Area | File | Notes |
|---|---|---|
| Leads | `routes/leads.js` | `POST /lead/ingest` creates lead + `enqueueCall` + notifications |
| Calls | `routes/newCalls.js`, `routes/calls.js` | `POST /calls/start` → `startOutboundCall`; `POST /calls/result` from Pipecat (`requireVoiceSecret`) |
| Queue / cron | `routes/internal.js` | `queue-worker`, `process-reminders` |
| Projects/teams | `routes/projects.js` | |
| Users | `routes/users.js` | Admin create via Supabase Auth Admin |
| Notifications | `routes/notifications.js` | WhatsApp + email |
| Integrations | `routes/integrations.js`, `webhookHandler.js` | Inbound webhooks enqueue calls |
| Credentials | `routes/credentials.js` | Encrypted tenant secrets (`ENCRYPTION_KEY`) |
| Calendar / Meta | `googleCalendar.js`, `metaIntegration.js` | OAuth exists; not required for the core loop |
| Demo | `routes/demo.js` | Landing “book a live demo” |
| Call tools | `routes/callTools.js` | Agent runtime tools during a live call |

Outbound call entry: `services/startOutboundCall.js`

1. Guard: set `leads.metadata.ai_call_status = In Progress` (409 if already in progress).
2. Insert `calls` row (`status = initiating`) **before** dialing so the CRM Calls page is truthful.
3. Build `call_brief` (`callContextBuilder` + `productSelector` + intent).
4. `POST {VOICE_SERVICE_URL}/voice/start-call` with `x-voice-secret`, 25s timeout.
5. Map FastAPI `{detail}` failures; CRM often sees generic “Voice service error” unless 401.

Queue: `services/callQueueService.js`

- Priorities: demo=1, manual=2, auto ingest=5.
- Max concurrent globally: `MAX_CONCURRENT_CALLS` (backend default 3; Pipecat default 4 — they can disagree).
- Max 2 attempts per lead per day.
- `SELECT FOR UPDATE SKIP LOCKED` in the worker.

Hobby Vercel crons exist but are daily. Do not design as if Vercel runs the queue every minute.

---

## 6. Voice VM (GCP)

| Item | Value |
|---|---|
| Project | `fleet-acumen-490202-c9` |
| VM | `cortex-pipecat`, e2-medium, `asia-south1-a` |
| Public IP | `34.180.6.84` |
| HTTPS | nginx TLS → `https://34-180-6-84.nip.io` → port 5000 |
| Process | PM2 `cortex-pipecat`, cwd `/opt/cortex-pipecat` |
| SSH | `cortexflowagent@34.180.6.84` (OpenSSH key `~/.ssh/id_ed25519`) |
| Caller ID | `+14355009976` |
| Telnyx Call Control app | `cortex_pipecat_cc` id `2977430545744528899` |

`pipecat-server/server.py` routes:

- `POST /voice/start-call` — backend only; requires `VOICE_SECRET`
- `POST /telnyx-webhook` — Telnyx Call Control events (Ed25519 verify)
- `WS /ws` — Telnyx media stream; Pipecat bot
- `GET /health`

Dial path:

```
startOutboundCall
  → POST /voice/start-call
  → Telnyx v2 Calls API (Call Control app)
  → call.answered webhook
  → streaming_start → WSS /ws
  → bot.py (STT/LLM/TTS)
  → POST backend /v1/calls/result
```

Media stack: Deepgram `nova-3` (Hindi default in `.env.example`), OpenAI `gpt-4o-mini`, ElevenLabs turbo (voice id configured on the VM).

Pipecat also runs `_queue_poller`: every 60s `GET {BACKEND_URL}/v1/internal/queue-worker` with `CRON_SECRET` / `VOICE_SECRET`.

**Current Telnyx blocker:** origination number not verified / account needs recharge. Health can still show providers true while outbound 403s.

---

## 7. CRM (Next.js)

`crm/middleware.ts` protects app routes; login/signup are public.

Notable pages:

| Route | Role |
|---|---|
| `/` | Dashboard: charts first, activity, quick actions |
| `/leads` | Lead desk; query `?status=` `?source=` `?q=` |
| `/calls` | Call log + start AI call |
| `/communications` | WhatsApp / email thread |
| `/appointments` | Booked visits |
| `/data` | CSV import/export, manual lead |
| `/integrations` | Webhook keys, Meta, etc. |
| `/team` | Teams + people (rewritten) |
| `/projects` | Campaign list (new) |
| `/tenant` | Workspace settings |
| `/usage` | Usage counters |

CRM → backend browser calls need `NEXT_PUBLIC_API_URL=https://cortex-backend-api.vercel.app`.

Server-only secrets: `SUPABASE_SERVICE_ROLE_KEY`. Never import `crm/lib/backendAuth.ts` from a server component (`next/headers` vs browser client). Use `backendAuth.server.ts` on the server.

---

## 8. Lead → call data path (happy path)

```
ingest (POST /v1/lead/ingest or /api/import or webhook)
  INSERT leads (status=new, metadata.scheduled_call_at = now+delay)
  enqueueCall (status=queued, scheduled_at, project_id if known)
  sendLeadEntryNotifications (email; WhatsApp if Twilio up)

≤60s later (tenant settings call_delay_seconds, clamped)
  Pipecat poller GET /v1/internal/queue-worker
  lock row → processing
  startOutboundCall → calls row → Telnyx dial

on result POST /v1/calls/result
  update lead status/metadata
  write transcript / analytics
  maybe appointment + reminders
  update call_queue (calling → done / retry / failed)
```

Ingest does **not** currently set `leads.project_id` unless the client sends it. CSV import and `/lead/ingest` can therefore enqueue calls with `project_id` null, which means **no kb_products** on the brief. If you discuss “AI doesn’t know the inventory,” check this first.

---

## 9. Communications

- **Email:** working in production (Resend or equivalent via backend notification + inbound webhook path).
- **WhatsApp:** Twilio; needs sandbox (or a live WhatsApp sender) before outbound alerts work.
- **Voice:** Telnyx as above.

Stored in `communications` (`channel`, `direction`, `provider`, `status`). ~118 rows in the live DB as of this briefing.

---

## 10. Environment (names only — no secret values)

Backend / Vercel `cortex-backend-api`:

- `DATABASE_URL`, `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `CALLING_MODE=live`, `VOICE_SERVICE_URL=https://34-180-6-84.nip.io`, `VOICE_SECRET`, `CRON_SECRET`, `ADMIN_TOKEN`
- `ENCRYPTION_KEY`, `CRM_URL`, `BACKEND_URL`
- Optional: `OPENAI_API_KEY`, Google/Meta OAuth, `MAX_CONCURRENT_CALLS`

CRM Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_API_URL`

Pipecat VM:

- `TELNYX_API_KEY`, `TELNYX_PHONE_NUMBER`, `TELNYX_CC_APP_ID`, `TELNYX_PUBLIC_KEY`
- `DEEPGRAM_*`, `OPENAI_*`, `ELEVENLABS_*`
- `BACKEND_URL`, `VOICE_SECRET`, `CRON_SECRET`, `SERVER_DOMAIN`

---

## 11. Live DB snapshot (20 Sep 2026, approximate)

Tables have `rls_enabled: true` in the schema listing. The API still uses the service connection, so RLS does not protect backend reads/writes. Browser Supabase clients would be subject to RLS if they queried tables directly; most CRM data goes through Express.

| Table | ~rows |
|---|---|
| tenants | 6 |
| user_profiles | 6 |
| teams | 2 |
| team_members | 0 before the team-flow fix (membership was unused) |
| projects | 2 |
| kb_products | 3 |
| leads | 17 |
| call_queue | 16 |
| calls | 27 |
| call_transcripts / call_events | 11 |
| communications | 118 |
| appointments | 0 |
| credentials | 0 |

Default / demo tenant often used in config: `b50750c7-0a91-4cd4-80fa-8921f974a8ec` (Acme). Operator `cortexflowagent@gmail.com` is linked in `user_profiles`.

---

## 12. Known gaps (do not paper over)

1. **Telnyx D51** — cannot complete live outbound until the number is verified and the account is funded.
2. **Twilio WhatsApp sandbox** — not started.
3. **Queue vs Vercel Hobby** — minute-level work depends on the VM poller staying up (PM2).
4. **Plan / Stripe** — `tenants.plan` is a string (`starter|growth|enterprise`). No billing, no enforcement.
5. **RLS vs service role** — policies may exist; the API bypasses them. Tenant isolation is application-level (`WHERE tenant_id = $1` + JWT match).
6. **No test suite.**
7. **No inbound PSTN** as a product (Telnyx is outbound Call Control).
8. **Lead ingest often omits `project_id`**, so the agent may call without inventory.
9. **Team scoping of leads** is not implemented; teams are organizational, not a security boundary yet.
10. **FastAPI `detail` vs Express `error`** — some voice failures surface as a generic CRM toast.

---

## 13. Suggested discussion topics (for the next model)

Use these as questions, not as assumed work:

- Should `project_id` become required on ingest, or should the tenant have a default project?
- Should executives only see leads for teams they belong to? That is a product + RLS decision.
- Keep Telnyx vs add a second carrier after recharge.
- Move queue worker off the voice VM (Cloud Run / always-on) so calling CPU and polling are not the same box.
- Whether signup should keep `tenant.id = user.id` or mint a separate org UUID (cleaner for transfer of ownership).

When proposing code, stay inside: Next CRM, Express backend, Pipecat server, Supabase SQL. Do not revive deleted LiveKit / FreeSWITCH / `voice-service`.
