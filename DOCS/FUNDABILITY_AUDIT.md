# CortexFlow Fundability & Product Readiness Audit

**Date:** 20 September 2026  
**Scope:** Full repository + live Supabase project (read-only)  
**Method:** Code and schema verification. Product documentation was treated as a claim list, not as evidence.  
**Constraint:** No production code was modified during this audit.

**Auditor stance:** Senior SaaS architect / CTO / venture-readiness review. The question is not “does CortexFlow have features?” It is “could this product credibly be sold, piloted, and funded as a standalone international B2B SaaS?”

---

## 1. Executive Summary

CortexFlow is a **founder-built, India-first AI outbound calling CRM**. A real product core exists: a Next.js CRM, an Express API, a Postgres schema with tenant IDs, a landing page with signup, and a live Pipecat + Telnyx voice path. That is more than a pitch deck.

It is **not yet a fundable multi-tenant SaaS**.

The gap is not missing landing-page features. The gap is that the **customer journey, tenancy, billing, and security model are unfinished**, while documentation (`DOCS/PROJECT_STATUS.md`, `DOCS/PRODUCT.md`) describes a completed V1–V3 platform that the repository no longer fully matches.

### Verdict in one paragraph

CortexFlow can demonstrate a **working demo of “lead in → AI call → CRM update”** for a single operator, on Indian numbers, with Hindi/Hinglish conversation. It cannot yet demonstrate a **defensible, isolated, billable, internationally deployable SaaS**. An incubator can be shown a prototype. A government programme can be shown a technical MVP with a security remediation plan. An angel investor can be shown a wedge (AI qualification for India real-estate / education lead gen). A VC will not underwrite this as a platform until RLS, API auth, billing, and a closed customer journey exist.

### Headline findings

| Area | Reality |
|---|---|
| Actual product | AI outbound qualifier + lightweight CRM, India-centric, real-estate-shaped |
| Tenants in live DB | 7 organisations, mostly expired 3-day trials, almost no usage |
| Paying customers | **None evidenced** in schema (no Stripe, no invoices, no `trial_ends_at` enforcement) |
| RLS | **Disabled on all 24 public tables** (Supabase advisor: ERROR) |
| Backend API auth | Most `/v1/*` routes are **unauthenticated**; `tenant_id` is a client-supplied UUID |
| Calling stack | LiveKit/`voice-service` **deleted**; Pipecat stack is **untracked** and does not write `calls` rows |
| Billing | Plan name is a string. No Stripe. No plan limits. |
| Tests | **Zero** test files |
| Legal/privacy | **No** privacy policy, terms, DPA, recording consent, or data-export/delete path |

### Fundability posture (internal, qualitative)

This is a **pre-seed technical prototype with a plausible wedge**, not a seed-ready SaaS. The honest pitch today is: “We built a working AI caller for Indian inbound-lead qualification, and we are hardening it into a product.” The dishonest pitch is: “We have a complete multi-tenant AI CRM platform ready for international scale.”

---

## 2. Current Architecture

### 2.1 What actually exists in the repository

```
landing/          Next.js 15 marketing site (www.cortexflow.in claimed)
crm/              Next.js 15 authenticated CRM (crm.cortexflow.in claimed)
backend/          Express API, Vercel serverless (cortex-backend-api.vercel.app claimed)
pipecat-server/   FastAPI + Pipecat 0.0.108 + Telnyx Call Control (GCP VM) — UNTRACKED
DOCS/             Internal manuals — STALE relative to current calling stack
voice-service/    DELETED (git status shows full tree deleted; docs still describe it)
```

There is **no README**, no `supabase/` migration folder in git, no test suite, no IaC (Terraform/Pulumi), and no monorepo tooling.

### 2.2 Runtime topology (verified from code)

```
Visitor
  → landing (Vercel)
  → crm/signup (Supabase Auth) → /api/onboarding/complete (service role upsert)

Authenticated CRM user
  → Next.js pages (session cookie)
  → CRM server routes (/api/crm-data, /api/import) use requireAuth()
  → then call backend with tenant_id in the URL/body, WITHOUT a user JWT

Backend (Express on Vercel)
  → pg pool via DATABASE_URL (service-level, bypasses RLS)
  → CORS *
  → proxies calls to VOICE_SERVICE_URL /voice/start-call

Pipecat server (GCP)
  → Telnyx v2 Calls API
  → Telnyx media stream WebSocket
  → Deepgram STT + OpenAI gpt-4o-mini + ElevenLabs TTS
  → POST /v1/calls/result (lead metadata only)
```

**Evidence:** `backend/server.js`, `backend/db.js`, `crm/lib/auth.ts`, `crm/lib/supabase-client.ts`, `pipecat-server/server.py`, `pipecat-server/bot.py`.

### 2.3 Documentation vs repository

| Claim in docs | Repository reality |
|---|---|
| LiveKit + FreeSWITCH + `voice-service` is the calling stack (`DOCS/PRODUCT.md`, `DOCS/TECHNICAL_MANUAL.md`) | `voice-service/` is deleted. Replacement is `pipecat-server/` (untracked). |
| V3 queue worker every minute (`DOCS/PROJECT_STATUS.md`) | `backend/vercel.json` only schedules `/v1/internal/process-reminders` once daily (`0 3 * * *`). Queue worker is not in Vercel cron. |
| Role middleware on all sensitive routes | No `requireRole` / auth middleware in backend route files. |
| RLS disabled “intentional for server-side-only access” | CRM browser still ships `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Anon grants + no RLS = public table access. |
| Stripe / billing remaining | Still missing. Plan is a varchar. |
| Google Sheets sync (landing pricing) | `crm/lib/data-source.ts` comment: “Google Sheets permanently removed”. |

Treat `DOCS/PROJECT_STATUS.md` as a historical sprint log, not a live system description.

---

## 3. Product Inventory

Classification key: **COMPLETE** · **PARTIALLY IMPLEMENTED** · **MOCKED** · **PLACEHOLDER** · **BROKEN** · **MISSING**

For each capability: status, evidence, explanation, recommended fix.

### 3.1 Frontend architecture — COMPLETE (with gaps)

**Evidence:** `landing/` (Next.js 15, marketing + get-started + signin redirect), `crm/` (App Router, Tailwind, dark mode, `middleware.ts` session gate).

The CRM has real pages: dashboard, leads (list/kanban), lead detail, communications, calls, appointments, data import/export, integrations, team, tenant settings, usage.

**Gaps:** Desktop-first; no in-app onboarding tour; `/analytics` only redirects (`crm/app/analytics/page.tsx`). Landing copy over-claims SSO, Google Sheets, unlimited leads.

**Fix:** Keep the CRM surface. Stop selling unbuilt features on the landing page. Add a first-run checklist, not more nav items.

---

### 3.2 Backend architecture — PARTIALLY IMPLEMENTED

**Evidence:** `backend/server.js` mounts leads, calls, appointments, credentials, admin, internal, email, newCalls, integrations, notifications, demo, projects, users, knowledgeBase, activityLogs, googleCalendar, metaIntegration, callTools.

This is a working API. It is not a production API: open CORS, no rate limit, no request auth, `ssl.rejectUnauthorized: false` (`backend/db.js`), pool `max: 1` (serverless constraint), global error handler only logs `err.message`.

**Fix:** Introduce a single auth middleware (Supabase JWT or backend session). Add rate limiting on public webhooks and `/v1/calls/start`. Fix TLS verification.

---

### 3.3 Database schema — PARTIALLY IMPLEMENTED

**Evidence:** Live Supabase `public` schema, 24 tables, RLS off, 0 policies. Migrations exist in Supabase (not in git):

- `20260311082153_create_calls_and_transcripts`
- `20260311082210_create_integrations_tables`
- `20260427224235_v2_user_profiles_and_teams`
- `20260427224257_v2_knowledge_base_and_demo`
- `20260505182148_v3_calling_stack_upgrade`
- later cascade / timestamptz / communications

**Live row counts (20 Sep 2026):** tenants 7 · leads 15 · calls 12 · call_transcripts 11 · communications 114 · user_profiles 5 · teams 2 · team_members **0** · projects 2 · knowledge_bases **0** · kb_products 3 · appointments **0** · call_queue **0** · credentials **0** · google_calendar_tokens **0** · tenant_usage 6 · lead_context 6 · call_analytics 4 · demo_requests 1 · integrations 1.

**Interpretation:** Schema is ahead of usage. Several “V2/V3” tables are unused by the current write path (appointments, call_queue, knowledge_bases, credentials).

**Fix:** Put schema in git (`supabase/migrations`). Either use the relational tables or delete the dual-write confusion. Appointments currently live in `leads.metadata`.

---

### 3.4 Authentication — PARTIALLY IMPLEMENTED

**CRM UI:** COMPLETE enough. Supabase email/password via `crm/app/login/page.tsx`, `crm/app/signup/page.tsx`, `crm/middleware.ts` (`getUser()`), `crm/lib/auth.ts`.

**Backend API:** MISSING user authentication. Routes trust `tenant_id` in params/body.

**Onboarding API:** `crm/app/api/onboarding/complete/route.ts` has **no session check**. It accepts `userId` in JSON and upserts a tenant with the service role (falls back to anon key).

**Invited users:** `user_metadata.tenant_id` override in `crm/lib/auth.ts` is the tenancy switch. Users can typically write their own `user_metadata` unless Auth hooks prevent it — that is a tenant-hop vector.

**Password policy:** signup requires 6 characters. Supabase leaked-password protection is disabled (advisor WARN).

**Fix:** Bind onboarding to the authenticated user id. Never trust client `userId`. Resolve tenant exclusively from `user_profiles`. Disable client metadata writes for `tenant_id`. Enable leaked-password protection.

---

### 3.5 Multi-tenancy — BROKEN for a commercial SaaS

**What exists:** Almost every table has `tenant_id`. Backend queries usually add `WHERE tenant_id = $1`. Onboarding sets `tenants.id = user.id`.

**What fails:**

1. RLS disabled → PostgREST + anon key can read/write every table.
2. Backend does not verify the caller belongs to that tenant.
3. Tenant identity is `user.id` for owners and `user_metadata.tenant_id` for staff — two models.
4. Invited users with empty metadata fall back to `user.id`, i.e. a phantom tenant.
5. `GET /v1/users/me` returns `role: 'admin'` when no profile exists (`backend/routes/users.js`).
6. Acme Real Estate (pilot) has 12 leads and **0 user_profiles** — tenancy and login are not the same system.

**Fix:** `user_profiles` as source of truth. RLS policies. JWT on every API call. Stop using `tenant.id = user.id`.

---

### 3.6 User roles — PLACEHOLDER

**Schema:** `user_profiles.role` check constraint `admin | manager | executive`. `team_members.role` `manager | executive`.

**UI:** Team page can create users with email+password (`crm/app/team/page.tsx` → `POST /v1/users/create`).

**Enforcement:** Docs claim “permission guards implemented in backend”. Grep of `backend/**` finds **no** `requireRole`, `checkRole`, or role middleware. `POST /v1/users/create` is unauthenticated. `team_members` has **0 rows**, so manager/executive scoping cannot be working in production.

**Fix:** Server-side role checks before user create, tenant patch, credential write, and call start. Invitation links instead of admin-chosen passwords. Do not default missing profiles to admin.

---

### 3.7 CRM functionality — PARTIALLY IMPLEMENTED

Working: lead list/detail, notes (`crm/app/api/leads/[leadId]/notes`), pipeline/kanban, dashboard charts from leads (`crm/lib/analyticsFromLeads.ts`), communications timeline, tenant settings UI, project wizard UI.

Not a full CRM: no deals/revenue objects, no tasks, no email sequences, no SLA, no custom fields UI, no audit viewer for security events, no SSO (claimed on landing).

**Fix:** Do not expand CRM breadth. Make the existing objects reliable and tenant-safe.

---

### 3.8 Lead management — PARTIALLY IMPLEMENTED

**Create/ingest:** `POST /v1/lead/ingest` (`backend/routes/leads.js`) — unauthenticated, phone idempotency per tenant, schedules `metadata.scheduled_call_at`.

**List/get:** `GET /v1/leads/:tenantId` — unauthenticated.

**Patch:** `PATCH /v1/leads/:leadId` — **no tenant_id in WHERE** (cross-tenant update if UUID is known).

**Import:** `crm/app/api/import/route.ts` — authenticated, naive CSV split (breaks on commas in quotes).

**Export:** `crm/app/data/page.tsx` client-side CSV of current tenant leads via `/api/crm-data`.

**Qualification:** Rule-based `leadIntentExtractor.js` + AI call outcome → `leads.status` / metadata. Not a scoring model.

**Fix:** Add tenant scope to every mutation. Authenticate ingest for CRM-originated creates; keep webhooks on signed secrets only.

---

### 3.9 Calling infrastructure — PARTIALLY IMPLEMENTED / BROKEN

**Current intended path:** CRM → `POST /v1/calls/start` (`backend/routes/newCalls.js`) → `{VOICE_SERVICE_URL}/voice/start-call` → Telnyx dial (`pipecat-server/server.py`) → media WS → Pipecat bot.

**Broken / incomplete:**

| Issue | Evidence |
|---|---|
| LiveKit stack gone | git status: `voice-service/` deleted |
| Pipecat not in git | `pipecat-server/` untracked |
| No writer to `calls` / `call_transcripts` | repo-wide grep: **zero** `INSERT INTO calls` or `INSERT INTO call_transcripts` |
| CRM Calls page reads `calls` table | `GET /v1/calls/:tenantId` in `newCalls.js`; `crm/lib/callsApi.ts` |
| `/v1/calls/start` unauthenticated | Anyone who knows `tenant_id` + `lead_id` can trigger PSTN (toll fraud) |
| Admission control is in-memory | Pipecat `_active_calls` / `_pending_calls` dicts die on process restart |
| AMD / voicemail detection disabled | `pipecat-server/server.py` comments |
| Inbound calling | MISSING |
| Single shared DID | `TELNYX_PHONE_NUMBER` env, default `+14355009976` |
| Dual schedulers | `jobs/callScheduler.js` (lead metadata) vs `call_queue` (0 rows) |
| Production cron | Only daily reminders in `backend/vercel.json` |

Result path **does** update lead metadata and can book appointments into metadata (`appointmentFromCall.js`). Transcripts therefore appear on lead detail if `/v1/calls/result` succeeds, but the Calls index can look empty/stale for new Pipecat calls.

**Fix:** Persist call rows before dial. Authenticate start. Put pipecat-server in git. Collapse to one scheduler. Assign a static IP / hostname. Do not sell inbound until it exists.

---

### 3.10 AI functionality — PARTIALLY IMPLEMENTED

**Evidence:** `pipecat-server/bot.py` — Hindi/Hinglish sales agent, tenant-branded identity, fresh vs follow-up greeting, product list injection, tools (`search_project_products`, `book_appointment`, `end_call`, memory), IST clock hardcoded, max call 300s.

Backend helpers exist: `callContextBuilder.js`, `productSelector.js`, `leadIntentExtractor.js`, `aiService.js` (GPT JSON analysis).

**Limits:** Prompt and product schema are **real-estate specific** (BHK, possession, location). Knowledge bases table is empty (0 rows); context depends on tenant name + `kb_products`. No evaluation harness, no call-quality QA, no multi-language product (German stopwords exist as a leftover, not i18n).

**Fix:** Keep one vertical voice (India real estate / education). Add 20 scored call recordings. Do not generalise the prompt to “any industry” until the wedge converts.

---

### 3.11 Automation engine — PARTIALLY IMPLEMENTED

There is **no** workflow builder, no n8n replacement UI, no user-defined automations.

What exists: ingest → delayed first call; retry on no-answer/busy; appointment reminders 24h/3h; post-call WhatsApp/email for appointment/callback.

`call_queue` is unused (0 rows). `enqueueCall()` exists in `callQueueService.js` but the live ingest path writes `leads.metadata.scheduled_call_at` instead.

**Fix:** Make **one** reliable path: ingest → queue row → worker → call → result → notify. Delete or stop the simulated fallback in production (`callScheduler.js` `runSimulatedCall`).

---

### 3.12 Integrations — PARTIALLY IMPLEMENTED

**Webhook ingest:** `POST /v1/webhook/:tenantId/:integrationKey` with optional secret. Normalizer supports Meta/Google/IndiaMART/Justdial/Zapier/Typeform/Tally/generic (`leadNormalizer.js`). Live: 1 integration, 3 logs.

**Secret optional:** `verifyWebhookSecret` returns `true` if no secret (`webhookHandler.js`). HMAC uses `JSON.stringify(req.body)` not raw body — Meta signatures will not verify correctly.

**Meta OAuth:** code in `backend/routes/metaIntegration.js`, unauthenticated `?tenantId=`. Challenge GET does not require verify token match on the generic webhook route.

**Google Calendar:** OAuth code exists; tokens stored **plaintext** in `google_calendar_tokens`; 0 rows connected.

**Google Ads:** claimed in `DOCS/PROJECT_STATUS.md` Phase 8. No dedicated Google Ads route file found.

**Landing claim “Google Sheets sync”:** false.

**Fix:** Require secrets. Verify raw-body HMAC. Encrypt Google tokens. Ship Meta webhook properly for the first vertical. Drop Sheets from marketing.

---

### 3.13 Billing / subscriptions — PLACEHOLDER

**Evidence:**

- UI plans in `crm/app/signup/page.tsx` and `landing/app/components/PricingCarousel.tsx`
- `tenants.plan` check constraint `starter|growth|enterprise`
- `tenants.trial_ends_at` set to now+3 days at onboarding
- **No Stripe**, no invoices, no subscription table, no webhook reconciliation
- **No plan-limit enforcement** (grep: only onboarding writes `trial_ends_at`)
- Usage counters in `tenant_usage` (`usageTracker.js`) — metering without charging
- Landing prices are “Trial first” / “Most teams” / “Let’s talk” — not a price

**Fix:** See Phase 8. Until Stripe exists, the product is a free tool, not a SaaS.

---

### 3.14 Analytics — PARTIALLY IMPLEMENTED

**Tenant dashboard:** lead-derived KPIs (`crm/app/api/stats/route.ts`, `analyticsFromLeads.ts`). Conversion rate is a lead-status ratio, not revenue.

**Usage page:** `crm/app/usage/page.tsx` fetches `/v1/calls/usage/:tenantId` and `/v1/calls/analytics` with **no auth headers**. `requireAnalyticsAuth` is a no-op (`callTools.js`).

**call_analytics:** 4 rows; agent may log via tools; not a company metrics warehouse.

**Missing for investors:** MRR, ARR, churn, NRR, cohort retention, CAC, payback.

---

### 3.15 Notifications — PARTIALLY IMPLEMENTED

**Code:** `notificationService.js` — Resend email + AiSensy WhatsApp templates. Triggers for new lead, appointment, callback, reminders. Communications logged.

**Live:** `credentials` table has **0 rows**. `getCredentials` throws if missing. WhatsApp is skipped when AiSensy is not configured. Email requires per-tenant Resend credentials — so production notifications likely no-op except where global env leftovers apply.

**Ingest uses global** `config.adminEmail` / `config.adminPhone` (`backend/config/index.js` hardcoded defaults), not tenant settings, despite tenant settings UI collecting `contact_email` / `whatsapp_number`.

**Email HTML interpolates lead fields unescaped** — stored XSS / email HTML injection.

**No SMS. No WhatsApp session messaging. No per-tenant sender ID.**

**Fix:** Wire tenant settings into notification recipients. Provision credentials as part of onboarding. Escape HTML. Do not claim four-channel notify until credentials exist per tenant.

---

### 3.16 Admin functionality — PARTIALLY IMPLEMENTED

Tenant settings page + `GET/PATCH /v1/tenant/:tenantId` (**no auth**). Admin token guard on `/v1/admin/*` **passes if `ADMIN_TOKEN` unset** (`admin.js`). User create/list unauthenticated. No super-admin console, no impersonation audit, no feature flags.

---

### 3.17 API architecture — PARTIALLY IMPLEMENTED

Public-ish surface:

- CRM-originated calls to backend **without JWT**
- Webhooks by URL
- Demo `POST /v1/demo/request`
- Internal crons with optional bearer
- Voice tools with optional `x-voice-secret` (skipped if env empty)

No OpenAPI spec, no versioning policy beyond `/v1`, no idempotency keys except phone duplicate and call_id in result.

---

### 3.18 Background jobs — PARTIALLY IMPLEMENTED / BROKEN in production shape

| Job | Code | Production trigger |
|---|---|---|
| Call scheduler | `jobs/callScheduler.js` | Local node-cron; **not** in `vercel.json` |
| Queue worker | `routes/internal.js` `runQueueWorker` | Route exists; **not** in `vercel.json`; docs say cron-job.org |
| Reminders | `jobs/reminderJob.js` | Vercel cron **daily 03:00**, while code is designed hourly; 2-hour reminder window can be missed |

Simulated calls still exist if `VOICE_SERVICE_URL` is unset — that would **fake CRM outcomes in production**.

---

### 3.19 Webhooks — PARTIALLY IMPLEMENTED

Lead webhooks: see 3.12.  
Telnyx: Ed25519 verify in Pipecat (good), with kill-switch `TELNYX_WEBHOOK_ENFORCE`.  
Email inbound: `POST /v1/email/inbound` — **no signature check**; looks up lead by email globally (`ORDER BY created_at DESC LIMIT 1`) — cross-tenant if two tenants share a contact email.

---

### 3.20 Storage — MISSING

No Supabase Storage buckets usage in code. No recording file store. Transcripts are text in DB / lead metadata. Call recordings (legal + QA) are not implemented.

---

### 3.21 Logging — PARTIALLY IMPLEMENTED

`console.log` / `loguru`. `activity_logs` table (7 rows) for some product events. No request ids, no structured JSON logs, no PII redaction, no log retention policy.

---

### 3.22 Monitoring — MISSING

No Sentry, Datadog, uptime check in repo. Health endpoints exist (`/health` on backend and Pipecat) but nothing watches them. Pipecat `/health` returns phone number and domain (information leak).

---

### 3.23 Deployment infrastructure — PARTIALLY IMPLEMENTED

Vercel for landing, CRM, backend. GCP VM for Pipecat. Nginx sample `pipecat-server/nginx-cortex-pipecat.conf`. Hostname via `nip.io` in env examples (IP in the hostname — breaks on VM restart).

`backend/.env.prod` is **not** covered by `.gitignore` (ignores `.env.production`, not `.env.prod`). `pipecat-server/.env.example` contains a **hardcoded `VOICE_SECRET`**.

Hobby-plan cron limits are documented — production reliability depends on an external cron vendor.

---

### 3.24 Environment configuration — PARTIALLY IMPLEMENTED

`backend/env.template`, `pipecat-server/.env.example`. Config centralised in `backend/config/index.js` (good) but includes **hardcoded default tenant UUID** and admin phone/email.

Calling default: `CALLING_MODE=simulated`.

---

### 3.25 Security mechanisms — BROKEN relative to multi-tenant SaaS bar

Present: AES-256-CBC for `credentials` (`encryption.js`; CBC not GCM; no key rotation), optional admin/cron/voice secrets, Telnyx webhook signatures, some `tenant_id` filters, HMAC helper (flawed).

Absent: RLS, API JWT, rate limits, CSRF on cookie APIs (Next is cookie-session; backend is bearer-less), security headers, WAF, audit of admin actions, secret scanning in CI, dependency scanning.

---

## 4. Customer Journey Audit

### A. Current flow (verified)

| Step | What happens | Break / manual step |
|---|---|---|
| Visitor | Landing `landing/app/page.tsx` | Marketing claims exceed product |
| Signup | `crm/app/signup/page.tsx` 3 steps + plan cards | Plan is cosmetic. Password min 6. No email-verify requirement in code |
| Org creation | `POST /api/onboarding/complete` upserts tenant id = user id | Unauthenticated; no workspace vs user distinction |
| Onboarding | Flag `onboarding_completed=true` immediately | No product tour, no KB, no phone number, no WhatsApp sender |
| First project | Dashboard may prompt (`crm/app/page.tsx` `showProjectPrompt`) | Optional, not blocking; KB table still empty |
| User invitation | Admin types email+password on Team page | Not an invite. Unauthenticated API. Staff tenancy via metadata |
| Lead create/import | CRM `/api/crm-data` or CSV `/api/import` or public `/v1/lead/ingest` | Ingest is public if tenant UUID leaked |
| Qualification | Happens on the call, not as a pre-score | Rule extractor is real-estate regex |
| Call initiation | Button → unauthenticated `/v1/calls/start` → Pipecat/Telnyx | Requires VM up, secrets match, Telnyx balance; or **simulated** if URL missing |
| Conversation | Hindi female agent via ElevenLabs | India/real-estate prompt; no recording consent |
| Transcript/result | Bot `notify_backend` → lead metadata | **`calls` table not inserted** — Calls page may not show the call |
| CRM update | Status/outcome/appointment in `leads.metadata` | `appointments` table unused (0 rows) |
| Follow-up | Retry scheduler + WhatsApp if credentials exist | Credentials 0 rows; queue 0 rows; cron weak |
| Appointment | Metadata + calendar UI from leads | Google Calendar 0 connections; reminders can miss daily cron window |
| Analytics | Dashboard + usage page | Usage/analytics APIs unauthenticated; no revenue metrics |
| Conversion | Status `interested` / appointment booked | No won/lost revenue, no payment |

**Demo request path:** `POST /v1/demo/request` creates a lead on `DEFAULT_TENANT_ID`, dials immediately, marks `call_completed=true` when HTTP start succeeds (not when the human conversation ends). Abuse: no rate limit.

### B. Ideal production flow

1. Visitor → verified email signup → Create Organisation (UUID ≠ user id)  
2. Guided onboarding: company, timezone, calling hours, **consent script**, first project, first product, connect WhatsApp/email sender, optional Meta webhook  
3. Invite teammates by email (magic link), roles enforced  
4. Lead enters via signed webhook or CSV  
5. Lead is queued with consent/DNC/timezone checks  
6. Worker dials tenant caller ID; agent discloses recording; qualifies; books; writes **call row + transcript + appointment row**  
7. CRM updates in realtime; follow-up task or second attempt is explicit  
8. Dashboard shows funnel: leads → connected → qualified → appointments → show-ups  
9. Trial clock + Stripe checkout → plan limits enforced  
10. Admin can export/delete tenant data  

### C. Missing components (journey-blocking)

1. Authenticated, tenant-bound APIs  
2. RLS  
3. Durable call records from Pipecat  
4. Working notification credentials per tenant  
5. Reliable scheduler in production  
6. Invite-based users  
7. Consent + DNC  
8. Billing + trial enforcement  
9. Recording storage  
10. Privacy/terms and data-subject requests  

---

## 5. Security Audit

Findings use: severity · evidence · path · explanation · recommended fix.

### CRITICAL

**C1 — RLS disabled on every public table**  
- **Evidence:** Supabase advisor `rls_disabled_in_public` count 24; SQL `relrowsecurity=false`, `policy_count=0`.  
- **Path:** live `public.*` (leads, tenants, credentials, google_calendar_tokens, call_transcripts, …).  
- **Explanation:** Anon and authenticated PostgREST roles can read/modify all rows if table grants exist (advisor: they do). `NEXT_PUBLIC_SUPABASE_ANON_KEY` is in the CRM browser bundle.  
- **Fix:** Enable RLS with tenant isolation policies. Revoke `anon` grants on sensitive tables. Keep service role on the server only.

**C2 — Backend tenant APIs are unauthenticated**  
- **Evidence:** `GET /v1/leads/:tenantId`, `POST /v1/calls/start`, `GET /v1/calls/:tenantId`, `PATCH /v1/tenant/:tenantId`, `POST /v1/users/create`, integrations CRUD.  
- **Path:** `backend/routes/leads.js`, `newCalls.js`, `admin.js`, `users.js`, `integrations.js`.  
- **Explanation:** Knowing or guessing a tenant UUID (onboarding uses user id = tenant id, and user ids are UUIDs from Auth) allows listing PII, starting paid phone calls, creating users, rewriting tenant settings.  
- **Fix:** Require `Authorization: Bearer <supabase access token>`, resolve tenant from `user_profiles`, ignore client tenant_id except as a sanity check.

**C3 — Unauthenticated outbound calling (toll fraud)**  
- **Evidence:** `router.post('/calls/start')` has no auth; Pipecat `/voice/start-call` only checks `VOICE_SECRET` if set.  
- **Path:** `backend/routes/newCalls.js`, `pipecat-server/server.py`.  
- **Fix:** User JWT + voice secret + per-tenant spend cap. Never skip secret if unset in production.

**C4 — Onboarding complete is an unauthenticated tenant factory**  
- **Evidence:** `crm/app/api/onboarding/complete/route.ts` trusts body `userId`; uses service role.  
- **Fix:** `requireAuth()` and `userId === session.user.id`.

**C5 — Secrets in repo-adjacent files**  
- **Evidence:** `pipecat-server/.env.example` includes a filled `VOICE_SECRET`. `backend/.env.prod` is untracked but **not gitignored** (`.gitignore` has `.env.production` only).  
- **Fix:** Rotate `VOICE_SECRET`. Gitignore `.env.prod`. Strip secrets from examples. Scan git history before any public repo.

### HIGH

**H1 — Google OAuth refresh/access tokens stored in plaintext**  
- **Path:** `public.google_calendar_tokens` columns `access_token`, `refresh_token`; `backend/routes/googleCalendar.js`.  
- **Fix:** Encrypt at rest (same vault as credentials). RLS.

**H2 — Cron and admin routes fail open**  
- **Path:** `backend/routes/internal.js` `if (!config.cronSecret) return next()`; `admin.js` same for `adminToken`.  
- **Fix:** Fail closed in `NODE_ENV=production`.

**H3 — Voice/tool/analytics auth fail open**  
- **Path:** `newCalls.js` `requireVoiceSecret`; `callTools.js` `requireVoiceSecret` and `requireAnalyticsAuth` no-op.  
- **Fix:** Fail closed. Remove the no-op.

**H4 — PATCH lead without tenant scope**  
- **Path:** `backend/routes/leads.js` `UPDATE leads ... WHERE id = $n`.  
- **Fix:** `AND tenant_id = $tenant`.

**H5 — Email inbound unauthenticated + global email lookup**  
- **Path:** `backend/routes/email.js`.  
- **Fix:** Resend signature. Lookup `(tenant_id, email)`.

**H6 — Users can hop tenants via `user_metadata.tenant_id`**  
- **Path:** `crm/lib/auth.ts` `effectiveTenantId`.  
- **Fix:** Ignore metadata; use `user_profiles`. Lock metadata with Auth hook.

**H7 — Demo endpoint can drain Telnyx**  
- **Path:** `backend/routes/demo.js` — no rate limit, default tenant.  
- **Fix:** CAPTCHA + IP rate limit + daily cap.

**H8 — AES-256-CBC credential encryption**  
- **Path:** `backend/encryption.js`.  
- **Fix:** AES-256-GCM; KMS-managed key.

### MEDIUM

**M1 — CORS `*`** — `backend/server.js`, `pipecat-server/server.py`. Restrict to CRM/landing origins.  
**M2 — `rejectUnauthorized: false`** — `backend/db.js`.  
**M3 — Webhook HMAC over `JSON.stringify(req.body)`** — `webhookHandler.js`. Use raw body.  
**M4 — Meta webhook challenge echo without token check** — `integrations.js` GET handler.  
**M5 — Notification HTML injection** — `notificationService.js`.  
**M6 — Health endpoint leaks DID and domain** — `pipecat-server/server.py`.  
**M7 — Default admin email/phone in config** — `backend/config/index.js`.  
**M8 — Leaked password protection off** — Supabase advisor.  
**M9 — No rate limiting anywhere.**  
**M10 — SSL/TLS and security headers not configured in app.**

### LOW

**L1 — Simulated call path can write fake transcripts** — `callScheduler.js`. Disable unless `CALLING_MODE=simulated` **and** not production.  
**L2 — CSV parser is not RFC 4180.**  
**L3 — Pipecat CORS `*` and in-memory call maps.**  
**L4 — No tests, no CI security scan.**

---

## 6. Multi-Tenancy Audit

### Isolation model today

Application-level `WHERE tenant_id = ?` on many reads, **not** on all writes, **not** at the database, **not** at the API gateway.

### Realistic cross-tenant attacks (no exploit payloads)

1. **Anon key + PostgREST:** `GET /rest/v1/leads` returns all tenants’ leads. Same for transcripts, credentials ciphertext, calendar tokens.  
2. **UUID oracle:** Signup user id **is** tenant id. Auth user UUIDs + `/v1/leads/{uuid}` dumps that org.  
3. **Start-call on another tenant’s lead** if both UUIDs known (leads list is public given tenant id).  
4. **Staff metadata overwrite** to another tenant UUID.  
5. **Inbound email** attached to the newest lead globally with that address.  
6. **Integration webhook** `POST /v1/webhook/{victimTenantId}/{key}` if secret unset.  
7. **Usage/analytics** `GET /v1/calls/analytics?tenant_id=` no auth.

### Tenant-specific resources

Shared: Telnyx number, OpenAI/Deepgram/ElevenLabs keys, AiSensy (when configured), VM, backend.  
Not tenant-specific: caller ID, TTS voice, WhatsApp WABA, recording bucket, encryption keys, rate quotas.

**This is a single-operator product with tenant columns, not multi-tenant isolation.**

---

## 7. International Readiness

| Topic | Status | Blocker? |
|---|---|---|
| Timezone | UI list on tenant page; **agent clock is IST**; appointment naive ISO forced to `+05:30` (`appointmentFromCall.js`) | Yes for non-India |
| Currency | None. Usage $ estimates hardcoded in `usage/page.tsx` | Yes for billing |
| Phone numbers | Default `+91` if 10 digits (`pipecat-server/server.py`, demo route) | Yes |
| Country codes | India-first; no calling-hours by country | Yes |
| Language | Hindi/Hinglish prompt; Deepgram `hi`; no locale packs | Yes as “international product”; OK as India wedge |
| Date formatting | Mixed `en-GB` / `en-US` / IST strings | Medium |
| GDPR | No DPA, no RoPA, no lawful basis capture, Mumbai VM + US AI vendors | **Yes for EU** |
| Data retention | None | Yes |
| Consent | No recording disclosure (docs admit this) | **Yes (India TRAI / US two-party states / EU)** |
| PII | Phones, transcripts in DB; logs unredacted | Yes |
| Deletion/export | CSV export of leads only; no tenant wipe, no call-delete, no Auth user delete UX | Yes |
| Email deliverability | Resend; per-tenant from-address via missing credentials | Yes |
| SMS | Missing | Optional |
| WhatsApp | AiSensy templates; India WABA model | Not a global WhatsApp architecture |
| International billing | Missing Stripe, tax, VAT/GST invoicing (GSTIN collected, unused) | Yes |
| Webhook reliability | Best-effort; no retry inbox | Medium |
| Rate limiting / abuse | Missing | Yes |

**Honest positioning:** Ship **India first** (IST, +91, Hindi, GST later). Do not claim international SaaS until timezone, E.164, consent, and Stripe Tax exist.

**TRAI / DND:** No DNC list integration. `do_not_call` is only a call-outcome enum, not a suppression list.

---

## 8. Competitive / Product Positioning

### 1. What is the actual product?

An **AI outbound qualification layer** sitting on a thin CRM, specialised in Hindi phone conversations for Indian lead-gen businesses (especially real estate).

It is not HubSpot, not Salesforce, not a full CCaaS, not an iPaaS.

### 2. Who is the ideal customer?

**Now:** India real-estate developers / brokers, coaching/edtech, and local service businesses that buy Meta/Google/IndiaMART leads and fail to call them in minutes.

**Not yet:** US SMB, EU GDPR customers, enterprise contact centres, companies needing inbound IVR.

### 3. Painful problem

Speed-to-call on paid digital leads. Human SDRs are slow, expensive, and inconsistent. After-hours leads go cold.

### 4. Measurable outcome

Minutes-to-first-call, connect rate, qualified appointments per 100 leads, cost per appointment vs human SDR.

**The product does not yet report these as customer-facing north-star metrics** (dashboard conversion is a status ratio).

### 5. Commodity features

CRM list/kanban, CSV import, calendar view, webhook ingest, WhatsApp templates, basic dashboards — all table stakes vs Zoho, GoHighLevel, HubSpot.

### 6. Differentiable features

- Hindi/Hinglish **voice** qualification with project-scoped product pitch  
- Sub-minute auto-dial after lead ingest  
- Call memory (`lead_context`) for follow-ups  
- Tight CRM loop (outcome → appointment → reminder)

Differentiation is **execution quality + vertical prompt + speed**, not a unique algorithm. Voice models are rented (OpenAI, Deepgram, ElevenLabs, Telnyx).

### 7. Remove / deprioritize

SSO, Google Sheets, “unlimited anything”, generic workflow engine, Google Ads OAuth, multi-industry prompt, inbound voice, enterprise SLA copy, second calling stack remnants (LiveKit docs, Exotel comments, simulated mode).

### 8. Core wedge

**“Paid lead → AI call in under 60 seconds → appointment on the calendar.”**  
India, one vertical, one language pair, one success metric (appointments per 100 leads).

### Category map

| Category | CortexFlow vs them |
|---|---|
| HubSpot / Zoho / Salesforce | They win CRM depth. CortexFlow should not compete there. Integrate later. |
| GoHighLevel | GHL wins agencies + funnels + WhatsApp. CortexFlow can win **voice qualification** if reliability is higher. |
| Close / Apollo | Outbound sales engagement; different motion (sequences, data). |
| Twilio custom | CortexFlow is a Twilio-class custom system with a UI. Fine for a studio; weak as a product until tenancy/billing exist. |
| Bland / Vapi / Retell / ElevenLabs Agents | They win generic voice infrastructure. CortexFlow must win **vertical outcome**, not raw TTS. |
| n8n | Automation plumbing. CortexFlow’s “engine” is a few crons, not a platform. |

---

## 9. Business Model Readiness

**Stated model (UI):** Starter / Growth / Enterprise, 3-day trial, no credit card.

**Implemented model:** Free usage until someone manually turns the tenant off. Shared AI/telephony cost hits the founder.

**Unit economics (from `DOCS/COST_FORECAST.md` + usage page heuristics):** voice minutes are the COGS (OpenAI/Deepgram/ElevenLabs + Telnyx). Without metering **enforced** at plan limits, a single abused tenant can destroy margin.

**GSTIN** is collected and unused — India billing not started.

**No packaging of included minutes vs overage.** Usage tracker is the beginning of metering, not a bill.

**Recurring revenue potential:** High **if** the wedge works (monthly minutes + seat + platform fee). **Today: zero.**

---

## 10. Traction Readiness

Live org snapshot (names only, no personal data):

| Tenant | Plan | Onboarding | Trial end | Leads | Calls | Users |
|---|---|---|---|---|---|---|
| Acme Real Estate | starter | false | null | 12 | 11 | 0 |
| Trinitx Solutions | growth | true | 2026-05-01 | 0 | 0 | 1 |
| nop | growth | true | 2026-05-20 | 1 | 0 | 1 |
| Rohan Real Estate (×2) | starter | true | 2026-06-10 | 2 / 0 | 1 / 0 | 1 / 0 |
| Sancromn Technologies | enterprise | true | 2026-06-12 | 0 | 0 | 1 |
| dsfsdfdf | starter | true | 2026-08-16 | 0 | 0 | 1 |

**Interpretation:** Self-serve signup works at least sometimes. Duplicate Rohan tenants show onboarding bugs. All trials expired. **Acme is a pilot/demo dataset, not a customer.** Communications 114 vs 15 leads suggests notification/logging tests, not production volume.

**Customer validation in repo:** none (no interviews, no NPS, no case study data model).

**Investor data room:** cannot be generated from the product. No MRR, no churn, no logos with contracts.

---

## 11. Funding Readiness

Qualitative only. Not a market score.

| Area | Current state | Missing | Why it matters | How to fix |
|---|---|---|---|---|
| **A. Innovation** | Applied voice + CRM loop, not novel IP | Defensible tech, evals, data advantage | Investors discount wrappers | Vertical data (outcomes, objection corpus) + reliability |
| **B. Product readiness** | Demo-able core, broken edges | Closed journey, persistence of calls, jobs | Churn at first real user | 30-day reliability sprint |
| **C. Technical defensibility** | Standard stack, untracked voice server | Tests, migrations in git, isolation | Diligence fails | Git + RLS + tests |
| **D. Scalability** | VM cap ~4 concurrent calls | Multi-tenant telephony, queues, horizontal bots | Cannot sell “unlimited” | Queue + capacity per plan; later multi-worker |
| **E. Market clarity** | India lead-gen / real estate implicit | Explicit ICP, pricing, geo | Confusion vs GHL/Vapi | One-sentence ICP |
| **F. Customer validation** | Founder usage / Acme sample | 3 design partners | Grants and angels ask | Paid or LOI pilots |
| **G. Traction** | ~15 leads, ~12 calls total | Usage that is not the founding team | Seed requires a curve | Weekly appointment KPI |
| **H. Business model** | Plan names | Stripe, COGS, packaging | Not a company yet | Price per seat + included minutes |
| **I. Recurring revenue** | None | Subscriptions | VC definition of SaaS | Card-on-file after trial |
| **J. Differentiation** | Hindi voice speed-to-lead | Proof vs human SDR | Otherwise commodity | A/B vs human on 500 leads |
| **K. Founder-market fit evidence** | TrinitX origin in product copy | Public proof, domain story in-product only | Diligence | Case narrative + compliance awareness |
| **L. GTM readiness** | Landing + Book Demo call | Sales process, onboarding success, SLA | Cannot convert demo→paid | One onboarding owner + script |
| **M. Security** | Critical gaps | RLS, API auth | Instant no for EU/US and many grants | Section 5 fixes |
| **N. Legal/IP** | ISC on backend; no CLA, no ToS | Counsel on voice recording, TRAI, DP, trademarks | Unfundable surprise | External counsel (Section 20) |
| **O. International** | India-shaped | TZ, GDPR, E.164 | Don’t raise on “global” yet | India-first story |
| **P. Metrics infra** | Operational counters | Company metrics | Board/investor updates | Section 17 model |
| **Q. Investor data readiness** | None | Data room | Wasted meetings | Simple metrics store + cohort sheet |

**Programme fit:**

- **Incubator:** Possible **after** security hotfix + one closed demo.  
- **Government startup grant:** Possible with India-focus, DPIIT/startup India hygiene, **not** with open PII.  
- **Accelerator:** Weak until 1–3 pilots and a price.  
- **Angel:** Possible on wedge + founder if security plan is credible.  
- **VC:** Too early. No revenue, no isolation, no unique data.

---

## 12. Critical Gaps

1. RLS off + anon key (data leak).  
2. Unauthenticated API (PII + toll fraud).  
3. Pipecat not persisting `calls` rows; voice stack not in git.  
4. Production jobs incomplete (cron).  
5. Billing absent; trials expired and unused.  
6. Notifications likely inert (0 credential rows).  
7. Docs/landing over-claim (SSO, Sheets, LiveKit, roles).  
8. No tests, no privacy surface, no recording consent.  
9. Tenant = user id; invited users unsafe.  
10. Shared telephony identity (one DID, one voice, one VM).

---

## 13. Recommended Product Scope

### MUST HAVE (Minimum Fundable Product)

- Signup → org → project → import/create lead → **real** AI call → transcript on lead **and** Calls page → appointment → WhatsApp/email to owner → dashboard funnel  
- RLS + JWT API auth  
- Signed webhooks  
- Call row persistence  
- One scheduler that actually runs in production  
- Recording/AI disclosure line  
- Stripe trial→paid (even one plan)  
- Privacy policy + Terms  
- India +91 / IST only, honestly marketed  

### SHOULD HAVE

- Team invites + real admin/manager roles  
- Per-tenant WhatsApp/email credentials  
- Meta Lead Ads working for 1 customer  
- DNC/opt-out flag that blocks dials  
- Usage limits by plan  
- Error tracking (Sentry) + uptime  
- 20-call evaluation set  

### LATER

- Inbound calling  
- Multi-language packs  
- Google Calendar  
- Agency/multi-workspace  
- SSO  
- Marketplace integrations beyond Meta + generic webhook  
- Workflow builder  

### DO NOT BUILD YET

- Salesforce/HubSpot clone features  
- Custom LLM training  
- Global WhatsApp  
- Second voice provider abstraction  
- Mobile native apps  
- White-label  
- AI “auto SDR sequences” across email+LinkedIn  

---

## 14. 30 / 60 / 90-Day Roadmap

### NOW (week 0–1) — stop the bleeding

1. Enable RLS + revoke dangerous grants (with a maintenance window).  
2. Add JWT auth to all backend routes; fail closed on secrets.  
3. Rotate `VOICE_SECRET`; gitignore `.env.prod`; remove secrets from examples.  
4. Persist `calls` + transcripts from Pipecat start/result.  
5. Commit `pipecat-server` and stop using LiveKit docs as truth.  
6. Disable simulated calls in production.  
7. Rate-limit `/v1/calls/start`, `/v1/demo/request`, `/v1/lead/ingest`.

### NEXT 30 DAYS — core journey works for one pilot

8. Production worker: one cron path, queue table actually used.  
9. Onboarding: auth-bound; create default project; capture calling hours.  
10. Notification credentials for the pilot tenant.  
11. Consent sentence at call start.  
12. Fix Calls page + appointments (write `appointments` **or** stop pretending the table exists).  
13. Invite users properly; delete metadata tenant override.  
14. Landing page honesty pass (remove SSO/Sheets/unlimited).  
15. First design-partner pilot (paid or LOI), India real estate or education.

### 60 DAYS — can charge

16. Stripe Checkout + Customer Portal: one paid plan, 14-day trial, usage visible.  
17. Enforce trial_ends_at and minute caps.  
18. Meta webhook + HMAC raw body for that pilot’s ads.  
19. Sentry + uptime on `/health`.  
20. Data export + tenant delete (manual runbook + button).  
21. 50 real calls evaluated; hangup/voicemail policy.

### 90 DAYS — fundable narrative

22. 2–3 pilots, appointment KPI vs baseline.  
23. Role enforcement.  
24. Basic DPA/privacy/terms (counsel).  
25. Metrics table for orgs (Section 17).  
26. Incubator/angel deck matching the product, not the old docs.

---

## 15. 6-Month Roadmap

- Reliability: static IP or Cloud Run/GKE for voice; capacity >4 calls if demand exists  
- Second vertical **only if** first vertical conversion is proven  
- TRAI/DND process with counsel  
- Optional inbound DID per tenant  
- India GST invoices  
- Still no HubSpot replacement; instead, **CSV + Meta + one CRM sync** if a customer demands it  
- Fundraising: angels/incubator with ₹/USD revenue, not feature lists  

---

## 16. Investor / Incubator Demo Flow (10 minutes)

| Min | Scene | Today | Need |
|---|---|---|---|
| 0:00 | Problem: ₹500 Meta lead, no one called | Slide | Keep |
| 0:45 | Workspace: tenant dashboard | Works if logged in | Real name, not Acme-only |
| 1:30 | Lead enters (form or CSV) | Works | Signed ingest |
| 2:30 | Qualification plan (project + product) | Partial (kb empty) | One property card |
| 3:30 | Start AI call, live listen | Possible if VM healthy | Show consent line |
| 6:00 | Transcript + outcome | Lead detail yes; Calls page unreliable | Persist call row |
| 7:00 | CRM status + appointment | Metadata calendar | Visible win |
| 8:00 | WhatsApp/email follow-up | Often skipped (no creds) | Must fire in demo tenant |
| 9:00 | Dashboard: connected → appointment | Weak metrics | One funnel chart |
| 9:30 | Outcome: “appointment booked without an SDR” | Story | Measure it |

**Do not demo:** Team roles, billing, Google Calendar, integrations grid, usage $ estimates, SSO.

---

## 17. Metrics to Track

The repo does **not** support company-level SaaS metrics. `tenant_usage` is operational metering.

### Proposed data model (do not implement in this audit)

```
org_metrics_daily (
  tenant_id, date,
  leads_created, leads_imported, leads_from_webhook,
  calls_attempted, calls_connected, call_seconds,
  qualified_leads, appointments_booked, appointments_completed,
  automations_run, ai_tokens_in, ai_tokens_out,
  whatsapp_sent, emails_sent
)

org_billing (
  tenant_id, stripe_customer_id, stripe_subscription_id,
  plan, status, trial_ends_at, current_period_end,
  seats, included_minutes, overage_minutes
)

org_health_monthly (
  tenant_id, month,
  mrr, seats_active, users_wau,
  retained, churned_flag
)
```

**Definitions**

| Metric | Definition |
|---|---|
| MRR/ARR | Sum of paid subscriptions (Stripe). |
| Active orgs | Orgs with ≥1 connected call in last 30d. |
| Active users | Users with CRM session in last 7/30d. |
| Retention/churn | Logo churn monthly; later NRR. |
| Leads processed | `leads` created. |
| Calls made/connected | From `calls` table, not metadata. |
| Conversations | Connected ≥10s (already in usageTracker). |
| Qualified leads | Outcome `interested` or appointment. |
| Appointments | Rows in `appointments` (once used). |
| Conversion | Appointments / connected calls **and** appointments / leads. |
| Automation executions | Queue jobs completed. |
| AI usage | Tokens + minutes per tenant. |
| Revenue per customer | Stripe + overage. |

Until `calls` inserts exist, **do not trust call KPIs**.

---

## 18. Technical Debt

- Two calling architectures in docs vs one in untracked folder  
- Dual appointment stores (metadata vs table)  
- Dual schedulers (metadata vs `call_queue`)  
- `tenant_id = user.id`  
- Dead `livekit-server-sdk` dependency (`backend/package.json`)  
- Exotel comments in `env.template` / `server.js`  
- `CALLING_MODE=simulated` default  
- Pool `max: 1` + no idempotent job runner in Vercel  
- No migrations in git  
- No tests  
- Landing/CRM copy drift  
- JSONB `leads.metadata` as the real product database  
- In-memory Pipecat state  
- CBC encryption, plaintext Google tokens  
- Hobby cron + external cron-job.org as a production dependency  

---

## 19. Security Risks (register)

See Section 5. Priority order for a CTO:

1. RLS + grant revocation  
2. API JWT  
3. Secret rotation + gitignore  
4. Call-start authorization + rate limits  
5. Fail-closed cron/admin/voice  
6. Encrypt OAuth tokens  
7. Fix inbound email  
8. Consent/DNC  

Assume **all current tenant PII should be treated as potentially exposed** until RLS is on and anon grants are reviewed. That is a disclosure decision for founders and counsel — not something to “quietly patch” if a public anon key was used against production.

---

## 20. Legal / IP items requiring external professional advice

This section is **not legal advice**. Engage qualified counsel in India (and in any target export market).

1. **Call recording and AI-voice disclosure** (India, US two-party states, EU).  
2. **TRAI / DND / telemarketing** rules for outbound AI.  
3. **DPDP Act (India)** — consent, purpose limitation, deletion, significant data fiduciary thresholds.  
4. **GDPR** if any EU resident data is processed (AI processors in the US).  
5. **WhatsApp Business / Meta** policy for AI messages.  
6. **Processor agreements** with OpenAI, Telnyx, Deepgram, ElevenLabs, Supabase, Vercel, GCP.  
7. **Trademark** “CortexFlow” / “CortexFlow AI”.  
8. **IP assignment** from contractors; backend `license: ISC` is not a product IP strategy.  
9. **GST / invoicing** once charging.  
10. **Employment vs contractor** for anyone who wrote the deleted voice-service.  
11. **Incident response** given RLS-off history.  
12. **Consumer deception** if the agent is instructed never to say it is AI (`bot.py` IDENTITY RULE) — may conflict with disclosure law.

---

## 21. Exact Next Actions

1. **Security freeze:** do not add features until C1–C5 are closed.  
2. **Enable RLS** with policies drafted and tested on a branch database (do not enable blindly on prod without policies — it will lock the app).  
3. **Backend auth middleware** using Supabase JWT; thread through CRM `fetchApi`.  
4. **Pipecat: INSERT call on start, UPDATE on result**; fix CRM Calls page.  
5. **Git:** add `pipecat-server` (without secrets); ignore `.env.prod`; rotate voice secret.  
6. **Production jobs:** one worker, fail closed, not simulated.  
7. **Pilot credentials:** Resend + AiSensy for one tenant; use tenant settings for admin notify.  
8. **Landing honesty + privacy/terms pages.**  
9. **Stripe one-plan.**  
10. **One design partner contract** with an appointment KPI.

---

## Appendix A — Inventory scorecard

| # | Capability | Status |
|---|---|---|
| 1 | Frontend architecture | COMPLETE |
| 2 | Backend architecture | PARTIALLY IMPLEMENTED |
| 3 | Database schema | PARTIALLY IMPLEMENTED |
| 4 | Authentication | PARTIALLY IMPLEMENTED |
| 5 | Multi-tenancy | BROKEN |
| 6 | User roles | PLACEHOLDER |
| 7 | CRM functionality | PARTIALLY IMPLEMENTED |
| 8 | Lead management | PARTIALLY IMPLEMENTED |
| 9 | Calling infrastructure | BROKEN (migration) / PARTIALLY IMPLEMENTED |
| 10 | AI functionality | PARTIALLY IMPLEMENTED |
| 11 | Automation engine | PARTIALLY IMPLEMENTED |
| 12 | Integrations | PARTIALLY IMPLEMENTED |
| 13 | Billing/subscriptions | PLACEHOLDER |
| 14 | Analytics | PARTIALLY IMPLEMENTED |
| 15 | Notifications | PARTIALLY IMPLEMENTED |
| 16 | Admin functionality | PARTIALLY IMPLEMENTED |
| 17 | API architecture | PARTIALLY IMPLEMENTED |
| 18 | Background jobs | PARTIALLY IMPLEMENTED |
| 19 | Webhooks | PARTIALLY IMPLEMENTED |
| 20 | Storage | MISSING |
| 21 | Logging | PARTIALLY IMPLEMENTED |
| 22 | Monitoring | MISSING |
| 23 | Deployment infrastructure | PARTIALLY IMPLEMENTED |
| 24 | Environment configuration | PARTIALLY IMPLEMENTED |
| 25 | Security mechanisms | BROKEN |

---

## Appendix B — What this audit did not do

- No penetration test beyond static review and advisor SQL.  
- No live call placed.  
- No Vercel/GCP dashboard review.  
- Secrets in untracked env files were **not** copied into this document.  
- No production data was altered.

---

## IF I WERE THE CTO — THE NEXT 10 THINGS I WOULD DO

1. **Treat the live database as exposed until proven otherwise:** enable RLS, revoke `anon` table rights, rotate the anon key if it was ever public, and decide with counsel whether tenants must be notified.  
2. **Put a JWT in front of every backend route** and stop sending bare `tenant_id` as the authorization model.  
3. **Rotate `VOICE_SECRET` immediately**, remove it from `pipecat-server/.env.example`, gitignore `backend/.env.prod`, and fail closed when secrets are missing in production.  
4. **Make Pipecat write `calls` and `call_transcripts` on every dial** so the CRM Calls page and any investor metric are true.  
5. **Commit the Pipecat stack, delete LiveKit from docs and dependencies, and run one scheduler** — the queue table, not simulated metadata jobs.  
6. **Rate-limit demo, ingest, and call-start** so the shared Telnyx number cannot be used for toll fraud.  
7. **Close the demo journey for one India design partner:** consent line, working WhatsApp/email, appointment visible, no fake features on the landing page.  
8. **Replace “plan cards” with Stripe + enforced trial/minutes** before talking about SaaS revenue.  
9. **Replace `tenant.id = user.id` and metadata tenant overrides** with `user_profiles` as the only membership record; invitations, not password-create.  
10. **Sell the wedge, not the platform:** Hindi speed-to-lead for Indian real-estate/education leads — and use 30 days of appointment conversion data as the fundraising asset, not a feature matrix.

---

*End of audit. Prepared from repository and live schema on 20 September 2026. No production code was changed.*
