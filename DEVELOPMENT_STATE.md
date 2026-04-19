# CortexFlow — Current development state

**Snapshot:** Technical inventory of this workspace as of the milestone where **outbound voice calls** work end-to-end (**Vercel backend → GCP `cortex_voice` → Supabase (pooler) → FreeSWITCH (Docker) → Telnyx → handset**).  
**Monorepo layout:** Four application packages under one folder; **no root `package.json`** (each app installs independently).

---

## 1. Root directory (`AI calling and CRM/`)

| Path | Purpose |
|------|---------|
| **`backend/`** | Express API — deployed to **Vercel** as `cortex-backend-api`. |
| **`crm/`** | Next.js 15 CRM — Supabase auth + data; separate Vercel project in production (see your deploy settings). |
| **`landing/`** | Next.js 15 marketing site — public landing. |
| **`voice-service/`** | TypeScript **cortex_voice** HTTP + ESL bridge; **mirrors** GitHub repo `nar0ttamm/cortex_voice` (VM deploy source is usually clone of that repo under `/opt/cortex_voice`). |
| **`.cursor/`** | Cursor IDE project metadata (not part of runtime). |
| **`.git/`** | Git repository for this monorepo-style folder. |
| **`.gitignore`** | Ignores `node_modules`, `.env*`, `.next`, `dist`, `.vercel`, logs, `*.zip`, etc. |
| **`CORTEXFLOW.md`** | Large architecture / API reference document (companion to this file). |
| **`GCP_SESSION_GUIDE.md`** | Operational checklist: VM start/stop, PM2, Docker FreeSWITCH, **`/health`** (not `/v1/health`), Vercel `VOICE_SERVICE_URL`, firewall **TCP 5000**. |
| **`Future scale up.zip`** | Archived asset in repo root (not unpacked by default). |

**Not in this tree:** Separate remote **`cortex_backend`** repo (historically used for Vercel-only backend deploys); keep backend changes in sync intentionally if you use both.

---

## 2. Backend (`backend/`)

### 2.1 Stack

- **Runtime:** Node.js, **Express 4**
- **Database:** `pg` **Pool** → **Supabase Postgres** (`DATABASE_URL`, SSL `rejectUnauthorized: false`, **`max: 1`** for serverless)
- **Deploy:** **Vercel** — `vercel.json` v2 **`builds`** entry `@vercel/node` on **`server.js`**, catch-all route; **`functions.server.js.maxDuration`: 60** (seconds, plan-dependent)
- **Local:** `node server.js` on `PORT` / `4000`; loads `dotenv` + optional `.vercel/.env.production.local`

### 2.2 Entry & middleware

- **`server.js`:** CORS, JSON + urlencoded body parser, mounts all `/v1` routers, global error handler, exports `app` for Vercel
- **`GET /health`:** Runs `SELECT 1` via **`db.js`** — **not** under `/v1`

### 2.3 Configuration (`config/index.js`)

Central trimmed env: `DATABASE_URL`, `ENCRYPTION_KEY`, `CALLING_MODE`, `CALL_DELAY_SECONDS`, `BACKEND_URL`, `DEFAULT_TENANT_ID`, admin contact, `ADMIN_TOKEN`, `CRON_SECRET`, **`VOICE_SERVICE_URL`**, **`VOICE_SECRET`**

### 2.4 Routes (all prefixed `/v1` unless noted)

| Module | Role |
|--------|------|
| **`routes/leads.js`** | Lead CRUD, **`POST /lead/ingest`**, status transitions, notes, etc. |
| **`routes/calls.js`** | Legacy / Exotel-oriented call flows (`callService`) |
| **`routes/newCalls.js`** | **AI voice:** **`POST /calls/start`** (proxy to voice service), **`POST /calls/result`** (from voice), **`GET /calls/:tenantId`** (joins `calls`, `leads`, `call_transcripts`) |
| **`routes/appointments.js`** | Appointments |
| **`routes/credentials.js`** | Tenant credentials |
| **`routes/admin.js`** | Admin operations (token-guarded) |
| **`routes/internal.js`** | Internal/cron hooks |
| **`routes/email.js`** | Email (incl. Resend inbound webhook GET ping) |
| **`routes/integrations.js`** | **Integrations engine:** public **`POST/GET /webhook/:tenantId/:integrationKey`**, CRM-facing integration CRUD, Meta test hooks, etc. |

### 2.5 Services & jobs

- **`services/`:** `leadService`, `callService`, `notificationService`, `aiService`, `credentialService`
- **`integrations/`:** `integrationManager`, `webhookHandler`, `leadNormalizer`
- **`jobs/`:** `callScheduler`, `reminderJob`, `index.js` — **node-cron**; started only when `server.js` is main (local); production scheduling externalized (Hobby plan constraints noted in docs)
- **`encryption.js`**, **`utils/asyncHandler.js`**, **`db.js`**

### 2.6 Env template

- **`env.template`** — documents core vars; **also set on Vercel:** `VOICE_SERVICE_URL` (e.g. `http://<VM_IP>:5000`), `VOICE_SECRET` (must match voice service)

---

## 3. Voice service (`voice-service/` → **cortex_voice**)

### 3.1 Stack

- **Language:** TypeScript → **`dist/`** via `tsc`
- **HTTP:** Express on **`PORT`** (default **5000**), bind **`0.0.0.0`** (`LISTEN_HOST` override)
- **DB:** `pg` **Pool** built from **`parseIntoClientConfig(DATABASE_URL)`** with explicit fields; **IPv4-only path:** `dns.resolve4(hostname)` for non-literal hosts (avoids IPv6-only Supabase direct host on GCP)
- **ESL:** **`modesl`** — `eslClient.ts`: connect/auth timeouts, **`originate` → &park()**, `uuid_kill`
- **AI deps (stub / simulated path):** Deepgram, OpenAI, axios, ws — used by **`speechRecognition.ts`**, **`conversationEngine.ts`**, **`voiceSynthesis.ts`**

### 3.2 Runtime modules (`src/`)

| File | Role |
|------|------|
| **`bootstrap.ts`** | `dotenv.config()`, `dns.setDefaultResultOrder('ipv4first')` (supplement to resolve4) |
| **`index.ts`** | Express app: **`POST /voice/start-call|end-call|call-result`**, **`GET /health`** |
| **`callController.ts`** | Validates **`x-voice-secret`**; **`start-call`:** `createCall` in DB → **immediate JSON `{ call_id }`** → **background** `freeswitchBridge.originateCall` |
| **`callStorage.ts`** | `calls`, `call_transcripts`, `call_events` SQL; query timeout race (**15s**); lazy pool + IPv4 resolve |
| **`freeswitchBridge.ts`** | **`USE_ESL_ORIGINATE`:** normalize E.164, **`SIP_CALLER_ID_E164`**, **`SIP_GATEWAY_NAME`**, `originatePark`; simulated branch runs stub pipeline (**`_sendAudioToCall` empty** — no real RTP) |
| **`eslClient.ts`** | ESL connection + originate + kill; env timeouts **`ESL_CONNECT_TIMEOUT_MS`**, **`ESL_API_TIMEOUT_MS`** |
| **`phoneE164.ts`** | Phone normalization |
| **`modesl.d.ts`** | Types for ESL |

### 3.3 Deploy target

- **GCP Compute Engine VM** — **`pm2`** runs `node dist/index.js` (e.g. name **`cortex_voice`**)
- **Docker:** **`safarov/freeswitch`** (ESL **8021**, SIP/RTP per your GCP firewall rules)
- **Firewall:** e.g. rule **`voice-api`**: **TCP 5000** from `0.0.0.0/0` to instances with matching **network tag**
- **Supabase on VM:** Use **Session pooler** URI (e.g. `aws-*-*.pooler.supabase.com:5432`) — **direct `db.<ref>.supabase.co`** often has **no IPv4 A record** from the VM

### 3.4 Stage 1 — voice / TTS (operational notes)

- **Latency metrics** (grep `pm2 logs cortex_voice | grep '\[metrics\]'`): `answer_to_first_stt_final_ms`, `stt_final_to_first_llm_chunk_ms`, `tts_synthesize_ms`, `answer_to_greeting_done`, etc.
- **TTS (Deepgram default):** voice is **`DEEPGRAM_TTS_MODEL`** (default **`aura-2-harmonia-en`**). ElevenLabs only when **`TTS_PROVIDER=elevenlabs`** plus keys. **`GET /health`** returns `tts_provider`, `deepgram_tts_model`, and `tts_warnings`.
- **ElevenLabs quality:** Default **`ELEVENLABS_STREAM_LATENCY=1`** (was 3) and optional **`ELEVENLABS_NATURAL_PRESET=true`** voice settings reduce “flat” speech; tune **`ELEVENLABS_MODEL`** (e.g. `eleven_multilingual_v2`) if turbo sounds too synthetic.
- **Backend → voice:** **`fetch`** to **`/voice/start-call`** with **~25s** abort in `newCalls.js`

### 3.5 Example & gateway config

- **`.env.example`** — ports, FS ESL, Telnyx gateway vars, `VOICE_SECRET`, `BACKEND_URL`
- **`freeswitch/telnyx.xml.example`** — reference SIP gateway snippet

---

## 4. CRM (`crm/`)

### 4.1 Stack

- **Next.js 15**, **React 18**, **TypeScript**
- **Auth / data:** `@supabase/supabase-js`, `@supabase/ssr`
- **Email (client/API):** `resend`
- **Styling:** Tailwind 3.4, `app/globals.css`

### 4.2 Auth & middleware

- **`middleware.ts`:** Supabase server client on cookie session; protects `/`, `/leads`, `/data`, `/communications` (and related); allows `/api`, `/auth`, `/_next`
- **`app/auth/callback/route.ts`**, **`app/login`**, **`app/signup`**, **`app/api/auth/logout`**

### 4.3 App routes & pages (`app/`)

| Area | Files |
|------|--------|
| **Shell** | `layout.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `AppHeader.tsx` |
| **Dashboard** | `page.tsx` (home) |
| **Leads** | `leads/page.tsx`, `leads/[id]/page.tsx`, `ClientProfilePanel.tsx` |
| **Pipeline / analytics / data** | `pipeline/page.tsx`, `analytics/page.tsx`, `data/page.tsx` |
| **Communications** | `communications/page.tsx` |
| **Appointments** | `appointments/page.tsx` |
| **Tenant** | `tenant/page.tsx` |
| **Integrations UI** | **`integrations/page.tsx`** |
| **Notifications** | `NotificationContext.tsx`, `NotificationToast.tsx`, `useLeadNotifications.ts` |

### 4.4 API routes (`app/api/`)

- **`me`**, **`stats`**, **`activity`**, **`import`**, **`sheets`** (legacy name may remain; **`lib/data-source.ts`** states **Supabase only**, Sheets removed)

### 4.5 Libraries

- **`lib/supabase/client.ts`**, **`server.ts`**, **`middleware.ts`**
- **`lib/auth.ts`**, **`lib/data-source.ts`**
- **`types/index.ts`**

---

## 5. Landing (`landing/`)

### 5.1 Stack

- **Next.js 15**, **React 19**, **TypeScript**
- **Tailwind 4** (`@tailwindcss/postcss`)

### 5.2 App structure

- **`app/page.tsx`** — main marketing page
- **Components:** `HeroBackground`, `PricingCarousel`, `FaqAccordion`, `ScrollReveal`, `SectionReveal`, `PageLoader`
- **`layout.tsx`**, **`globals.css`**

---

## 6. Cross-cutting: data & secrets

- **Primary DB:** **Supabase Postgres** — shared logical schema for leads, calls, integrations, transcripts (exact migrations live in Supabase / `CORTEXFLOW.md` references)
- **Secrets:** Never commit **`.env`**; backend on **Vercel**; voice on **VM `/opt/cortex_voice/.env`**; CRM **`NEXT_PUBLIC_*`** + server keys in Vercel env
- **Shared voice trust:** **`VOICE_SECRET`** identical on Vercel and VM

---

## 7. Logic & behavior (short)

### 7.1 System story

- **Single Postgres (Supabase)** is the source of truth for **leads**, **calls**, **credentials**, **integrations**, **transcripts/events**.
- **Vercel backend** owns **HTTP API**, **cron-friendly jobs** (when run locally or via external cron), and **orchestration** (when to call, what to send to Exotel vs voice service).
- **GCP VM `cortex_voice`** owns **SIP leg control** (ESL → FreeSWITCH → carrier) and **writing call rows**; it is **not** serverless — it must be **reachable on TCP 5000** from the internet for Vercel to `fetch` it.
- **CRM** is a **Next.js** app: users authenticate with **Supabase**; it reads/writes business data through **Supabase client** and/or your **backend API** depending on the feature.
- **Landing** is **static marketing**; no shared session with CRM unless you wire links.

### 7.2 Lead lifecycle (backend)

1. **Create:** **`POST /v1/lead/ingest`** (CRM, manual, or internal) inserts a row; **duplicate phone** per tenant returns existing `lead_id` without a second insert.
2. **Metadata:** New leads get **`metadata`** fields such as **`scheduled_call_at`**, **`call_initiated`**, **`calling_mode`** mirroring env.
3. **Notifications:** **`notificationService`** may email/SMS admins; failures are logged, not fatal to ingest.
4. **Integrations:** **`POST /v1/webhook/:tenantId/:integrationKey`** accepts arbitrary JSON; **`webhookHandler`** + **`leadNormalizer`** map into the same lead shape, optional **HMAC/header secret** check, then create/update lead.
5. **Scheduler (local `node server.js`):** **`jobs/callScheduler`** periodically finds leads due for outreach according to **`CALLING_MODE`** and stored metadata — can enqueue **simulated** or **live** behavior (legacy **`callService`** / Exotel path). **Production** often relies on **external cron** hitting an internal route with **`CRON_SECRET`** instead of long-lived cron inside Vercel.

### 7.3 AI outbound call path (new stack)

1. **Trigger:** Client sends **`POST /v1/calls/start`** with **`tenant_id`**, **`lead_id`**.
2. **Backend (`newCalls.js`):** Loads **phone, name, inquiry** from **`leads`**; aborts if **`VOICE_SERVICE_URL`** unset; builds script snippet from inquiry.
3. **Proxy:** **`fetch(VOICE_SERVICE_URL + '/voice/start-call')`** with JSON body + **`x-voice-secret`**; **~25s** **`AbortController`** — avoids hanging forever if VM is down.
4. **Voice (`callController.startCall`):** If **`VOICE_SECRET`** set, header must match. Validates body; generates **`call_id`** (UUID).
5. **DB insert:** **`callStorage.createCall`** — **`INSERT` into `calls`** (status `initiating`); queries wrapped in **15s** timeout race; pool uses **IPv4 `resolve4`** + **pooler host** on VM.
6. **Fast HTTP response:** **`res.json({ call_id })`** immediately so Vercel returns **200** quickly.
7. **Background dial (`freeswitchBridge`):** If **`USE_ESL_ORIGINATE`** (default true): normalize **`phone` → E.164**, require **`SIP_CALLER_ID_E164`**, build **`sofia/gateway/<name>/<e164> &park()`**, **`originatePark`** via ESL; on success **`updateCallStatus(..., 'ringing')`**; on failure **`failed`** + error message. If **`USE_ESL_ORIGINATE=false`**: runs **stub** STT/LLM/TTS pipeline in process (**no real audio to the PSTN** — **`_sendAudioToCall`** is empty).
8. **Completion (stub/simulated path):** **`freeswitchBridge`** may **`POST /voice/call-result`** locally → **`callStorage.saveCallResult`** + **`fetch(BACKEND_URL/v1/calls/result)`** to update CRM lead. **Live ESL park path** today does **not** auto-run full AI completion unless you add FS events or timers.

### 7.4 Legacy / parallel call path

- **`routes/calls.js`** + **`callService`** implement **Exotel-oriented** flows (callbacks, simulated mode, etc.). They coexist with **`newCalls.js`**; which one your product uses depends on the feature (scheduler vs manual AI start).

### 7.5 Credentials & encryption

- **Tenant credentials** (API keys, provider configs) stored encrypted with **`ENCRYPTION_KEY`** (**AES** in **`encryption.js`**); **`credentialService`** reads/writes through **`credentials`** routes and DB.

### 7.6 Integrations engine (logic)

- **`integrationManager`** persists integration rows per tenant (**key**, webhook URL, secret hash, enabled flags).
- **Inbound webhooks** are **tenant-scoped URL** — no guessable global secret without **`tenantId`**.
- **GET** on webhook URL supports **Meta / generic verification** challenges.

### 7.7 CRM (logic)

- **Session:** Middleware refreshes Supabase cookies; unauthenticated users hitting protected paths are redirected to **login**.
- **Data:** **`data-source.ts`** is a thin facade over **`supabase-client`** — **Google Sheets removed**; all lead list/create/update paths hit Supabase.
- **UI:** Pages compose **shell + sidebar**; **real-time-ish** behavior via **notifications hook/context** (polling or channels as implemented in those files).
- **Integrations page:** Manages **backend integration** entities (keys, webhook copy-paste) against **`/v1/integrations/*`** when configured.

### 7.8 Landing (logic)

- **Server-rendered / static Next** marketing sections: hero, pricing carousel, FAQ, scroll animations — **no Supabase** in the described tree; forms (if any) would POST to external endpoints you configure.

### 7.9 Failure modes you already hit (reference)

| Symptom | Typical cause |
|---------|----------------|
| **504 Voice service timeout** | Voice waited for ESL before responding; fixed by **early HTTP** + backend timeout. |
| **502 ENETUNREACH IPv6 :5432** | VM used **direct** Supabase host with **no IPv4**; fix: **pooler URL** + **`resolve4`** in voice. |
| **No ring** | Wrong **`VOICE_SERVICE_URL`**, VM stopped, **firewall** not on VM tag, **FS/Telnyx** credentials, or **invalid E.164** / caller ID. |

---

## 8. Verified milestone (this stage)

- **`GET https://cortex-backend-api.vercel.app/health`** — DB OK
- **`POST /v1/calls/start`** with lead having **verified E.164** — returns **`initiated`** + **`call_id`** quickly; **handset rings** via Telnyx/FS (when VM, Docker FS, PM2, firewall, pooler DB, and envs are correct)

---

## 9. Next engineering frontier (not yet in this snapshot)

- **Media path:** RTP or CPaaS streaming to connect **live call audio** ↔ **STT / LLM / TTS** (ESL branch still **park**-only for AI)
- **CRM:** Surface **`calls`** status / errors in UI; optional webhooks for progress
- **Ops:** `pm2 startup` systemd, password rotation, monitoring

---

*This document describes the repository as laid out on disk. Deploy URLs, tenant IDs, and IPs are environment-specific — set in Vercel/GCP/Supabase, not hardcoded here.*
