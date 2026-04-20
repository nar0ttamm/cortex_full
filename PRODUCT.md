# CortexFlow — Product, Motives, and Technical Architecture

This document describes **what CortexFlow is**, **why we build it**, and **how the system works** across the CRM, API backend, Google Cloud VM, and the **cortex_voice** (voice-service) runtime.

---

## Part A — Product and real-world value

### What CortexFlow is

CortexFlow is a **multi-tenant B2B platform** that combines a **modern CRM** with **AI-powered outbound phone conversations**. Sales and operations teams use it to capture leads from many sources (forms, ads, marketplaces, webhooks), **qualify them automatically**, **log every touchpoint**, and **move opportunities through a pipeline** without juggling spreadsheets and disconnected tools.

### What it can do in practice

- **Lead capture** from landing pages, CSV import, manual entry, and **integrations** (Meta Lead Ads, Google Lead Forms, IndiaMART, Justdial, Zapier, Typeform, Tally, generic webhooks). Payloads are normalized so one consistent **lead record** lands in the database.
- **Notifications** to your team (e.g. email, WhatsApp patterns depending on configuration) when new leads arrive.
- **Outbound AI calls** initiated from the CRM: the system contacts the lead’s phone, runs a **real-time voice conversation** (speech recognition, language model, text-to-speech), and writes **call status, transcript fragments, summaries, and outcomes** back to the lead and call records.
- **CRM workflows**: dashboard metrics, pipeline board, lead detail with notes, communications timeline, appointments calendar, calls list, data import/export, and integration management (webhook URLs and secrets).

### Motives (why we build this)

- **Reduce response latency**: many deals are lost because no one calls back within minutes. CortexFlow is designed to **initiate contact quickly** and consistently.
- **Single source of truth**: leads, calls, appointments, and messages live in **one Postgres-backed system** (Supabase), not in five different inboxes.
- **Explainable automation**: outcomes and transcripts are tied to **lead and call IDs**, so teams can audit what the AI did and refine scripts and integrations.
- **Composable stack**: the **API** and **voice service** can evolve independently—telephony and media stay on a **long-lived VM**, while the CRM and API follow **serverless** deployment patterns on Vercel.

---

## Part B — Technical architecture (by subsystem)

### 1. CRM (`crm/` — Next.js)

- **Stack**: Next.js 15, React, TypeScript, Tailwind CSS, Supabase Auth (`@supabase/ssr`).
- **Role**: Authenticated web app for tenants. Users sign in with Supabase; **middleware** protects app routes. Pages cover dashboard (stats, analytics charts, activity), leads list and detail, pipeline, communications (per-lead threading), calls, appointments, data import/export, integrations UI, tenant settings, login/signup.
- **Data access**: Server and client use Supabase for leads and metadata; some features call the **backend API** (e.g. stats, activity, calls, integrations) using `NEXT_PUBLIC_API_URL` and tenant context.
- **Deployment**: Typically **Vercel** as a separate project from the backend; environment variables configure Supabase keys and API base URL.

### 2. Backend API (`backend/` — Express on Vercel)

- **Stack**: Node.js, Express 4, `pg` pool to **Supabase Postgres**, optional encryption for credentials, Resend/email routes, integration webhooks.
- **Role**: HTTP API under `/v1` for leads (CRUD, ingest), **AI call orchestration** (`routes/newCalls.js`: start call, call result, list calls by tenant), legacy Exotel-oriented routes (`routes/calls.js`), appointments, credentials, admin, internal/cron hooks, email, and **integrations** (`routes/integrations.js` + `integrations/webhookHandler.js`, `leadNormalizer.js`, `integrationManager.js`).
- **Voice integration**: `POST /v1/calls/start` proxies to **`VOICE_SERVICE_URL`** (e.g. `http://<GCP_VM_IP>:5000`) with shared **`VOICE_SECRET`**. `POST /v1/calls/result` receives completion payloads from the voice stack to update leads and calls.
- **Database**: Shared schema with the CRM—`tenants`, `leads`, `calls`, `call_transcripts`, `call_events`, `integrations`, `integration_logs`, etc.
- **Deployment**: **Vercel** with `vercel.json` building `server.js` as a serverless function; `GET /health` (outside `/v1`) checks DB connectivity.

### 3. Google Cloud Platform VM (telephony host)

- **Role**: Runs **Docker** (e.g. FreeSWITCH image), **PM2** (or similar) for the Node voice process, and exposes **TCP 5000** (HTTP API) to the internet so Vercel can reach the voice service. **Firewall rules** must allow this port (and SIP/RTP as required by your carrier).
- **Operational reality**: VM public IP may change on stop/start—**`VOICE_SERVICE_URL` on Vercel** must stay in sync. Health is checked with **`GET /health`** on the voice service (not the backend path).
- **Database from VM**: The voice service should use Supabase **session pooler** hostnames with **IPv4** compatibility (direct DB hosts can fail from some VMs); the codebase uses IPv4 resolution patterns where needed.

### 4. cortex_voice (`voice-service/` — mirrors repo `cortex_voice`)

- **Stack**: TypeScript, Express on port **5000**, **ESL** to FreeSWITCH (`modesl`), streaming **Deepgram** STT, **OpenAI** LLM, **Deepgram Aura** or **ElevenLabs** TTS (config-dependent), optional **Redis** for session state, `pg` for call rows and transcripts.
- **Role**:
  - **`POST /voice/start-call`**: validates secret, creates `call_id`, persists initial call row, returns JSON immediately; originates PSTN/SIP call via FreeSWITCH in the background.
  - **Media path**: RTP/audio fork → WebSocket ingress → STT → LLM → TTS → playback into the call leg; barge-in and metrics depend on feature flags and deployed version.
  - **Completion**: saves transcript/summary and notifies **`BACKEND_URL`** (`/v1/calls/result`) so the CRM-backed lead updates.
- **Deploy path**: Build `tsc`, run `node dist/index.js` under PM2 on the VM; FreeSWITCH runs in Docker; Telnyx (or other) SIP gateway configured in FreeSWITCH.

### End-to-end data flow (simplified)

```
Lead source → Backend webhook → normalize → Supabase lead
                    ↓
CRM user or scheduler → POST /v1/calls/start → cortex_voice /voice/start-call
                    ↓
FreeSWITCH + carrier → audio ↔ STT / LLM / TTS
                    ↓
Call end → POST /v1/calls/result → lead metadata + CRM UI
```

### 5. Landing (`landing/`)

- Marketing **Next.js** site (public). Not coupled to CRM auth; forms may POST to configured ingest endpoints.

---

## Part C — Environment and trust boundaries

- **Secrets**: `VOICE_SECRET` must match between Vercel backend and the VM voice service. Integration webhooks may use **HMAC** or **Bearer** secrets per integration row.
- **Multi-tenancy**: Tenant ID scopes leads, integrations, and call listing APIs.

---

*URLs, tenant IDs, and IP addresses are deployment-specific—configure them in Vercel, Supabase, and GCP, not in this document.*
