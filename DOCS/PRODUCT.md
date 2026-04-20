# CortexFlow — Product Overview & Architecture

> Last updated: April 2026 — reflects current live production state.

---

## What CortexFlow Is

CortexFlow is a **multi-tenant B2B SaaS platform** that pairs a modern CRM with an AI-powered outbound calling engine. Sales and operations teams capture leads from any source, let an AI assistant call and qualify those leads in real time, and manage every outcome — appointments, callbacks, call transcripts, notes — in one system.

---

## What It Does

### Lead Capture
Leads arrive from landing pages, CSV import, manual CRM entry, and a growing list of integrations: **Meta Lead Ads, Google Lead Forms, IndiaMART, Justdial, Zapier, Typeform, Tally, and generic webhooks**. Every source normalises to a single lead record in Postgres.

### Instant Notifications
On every new lead, the system fires four parallel notifications:
- **WhatsApp to admin** — alerts the team immediately
- **WhatsApp to lead** — warm "we received your inquiry" message
- **Email to admin** — full lead details
- **Email to lead** — confirmation (if email provided)

### AI Outbound Calls (LiveKit Pipeline — current)
When an AI call is triggered (manually from CRM or via scheduler):
1. Backend proxies the request to the **cortex_voice** Node.js service on the GCP VM
2. cortex_voice creates a LiveKit room and dispatches a Python AI agent
3. LiveKit SIP (Docker container) dials the lead's phone via Telnyx
4. A Python LiveKit Agent runs the conversation using **OpenAI Realtime API** (default) or **Groq LLM + Deepgram STT/TTS** (alternative mode)
5. The agent uses `book_appointment` and `end_call` function tools to signal outcomes
6. On call end, the agent posts results to cortex_voice → Supabase → CRM updates live

### Post-Call Notifications
After a call completes, the system fires targeted notifications:
- **Appointment booked** → WhatsApp + Email to both admin and lead (with date/time)
- **Callback requested** → WhatsApp only (no email) to both admin and lead
- Reminders fire automatically at **24 hours** and **3 hours** before appointment time

### CRM Workflows
Dashboard stats & charts · Lead list with pipeline board · Lead detail with notes, timeline, chat-style call transcript · Communications log · Appointments calendar · Call history · Data import/export · Integrations management · Tenant settings

---

## Technical Architecture

### 1. CRM — `crm/` (Next.js 15 on Vercel)
- **Auth**: Supabase Auth with server-side session middleware
- **UI**: React, TypeScript, Tailwind CSS, dark mode
- **Data**: Reads leads/metadata from Supabase directly; calls backend API for voice actions and stats
- **Polling**: Silent background polls (no flash) during live calls; appointment toast notifications

### 2. Backend API — `backend/` (Express on Vercel)
- Supabase Postgres via `pg` pool, encrypted credentials store, cron jobs (Vercel Cron)
- Key routes under `/v1`:
  - `POST /lead/ingest` — normalise + notify + schedule call
  - `POST /calls/start` — proxy to cortex_voice
  - `POST /calls/result` — receive outcome from voice stack, update lead, fire post-call notifications
  - `POST /notifications/send` — manual notification trigger from CRM
  - `GET  /calls/:tenantId` — list call history
  - `GET  /internal/process-pending-calls` — Vercel Cron scheduler
  - `GET  /internal/process-reminders` — Vercel Cron reminder job

### 3. GCP VM (Telephony Host)
Runs all real-time voice services under PM2 (auto-start on boot):

| PM2 Service | What it does |
|---|---|
| `cortex-livekit` | LiveKit Server (WebRTC media router) |
| `cortex-sip` | LiveKit SIP bridge → Docker image `livekit/sip:latest` |
| `cortex-agent` | Python LiveKit AI Agent (`main.py`) |
| `cortex_voice` | Node.js HTTP API on port 5000 (public entry point) |

Docker auto-restarts: `freeswitch` (unless-stopped), `cortex-sip-container` (managed by PM2 via shell script).

**After VM restart**: run `bash ~/cortexflow-status.sh` — shows service health and the IP to update in Vercel.

### 4. cortex_voice — `voice-service/` (TypeScript, port 5000)
- Receives `/voice/start-call` from backend
- Creates LiveKit room, dispatches AI agent, bridges SIP via Telnyx
- Agent posts results back to `/voice/call-result` on port 5000
- cortex_voice then notifies the Vercel backend at `/v1/calls/result`

### 5. Python AI Agent — `voice-service/agent/main.py`
- **Realtime mode**: OpenAI Realtime API (`gpt-4o-realtime-preview`, shimmer voice) — single WebSocket, ultra-low latency
- **Groq mode**: Silero VAD + Deepgram STT + Groq LLM (`llama-3.3-70b-versatile`) + Deepgram TTS
- Greeting: `"Namaste [name] ji, main [company] se baat kar raha hoon — kya aapke paas ek minute hai?"`
- Language: Hindi/Hinglish by default; adapts to caller's language
- Tools: `book_appointment(iso, notes)` and `end_call(outcome)` — explicit function calls
- Auto-disconnect: 4-second buffer after farewell, then SIP hangup via LiveKit RoomService API

### 6. Notification Stack
- **WhatsApp**: Twilio API (sandbox for testing, production number needed for real delivery)
- **Email**: Resend API (domain verification needed for production)
- **Triggers**: new lead (4 messages), post-call appointment (4 messages), post-call callback (2 WhatsApp only), manual from CRM button

---

## End-to-End Call Data Flow

```
Lead arrives → Backend /lead/ingest → Supabase lead row
                                    → Notifications (WhatsApp + Email)
                                    → Scheduler queues call

CRM user clicks "Start AI Call"
  → CRM → /v1/calls/start (Vercel backend)
  → cortex_voice /voice/start-call (GCP VM port 5000)
  → LiveKit room created + agent dispatched
  → LiveKit SIP dials Telnyx → lead's phone rings

Live call:
  Lead answers → audio via RTP → LiveKit → Python agent
  Agent speaks (OpenAI Realtime TTS or Deepgram TTS)
  Agent listens (VAD + STT)
  Agent decides next action (LLM)
  Agent calls book_appointment() or end_call()
  Farewell spoken → 4s delay → SIP hangup

Call ends:
  Agent POSTs result → cortex_voice /voice/call-result
  cortex_voice saves to Supabase (calls, call_transcripts tables)
  cortex_voice notifies Vercel backend /v1/calls/result
  Backend updates lead metadata + fires notifications
  CRM polls silently → lead detail refreshes
```

---

## Environment Variables (key ones)

| Variable | Where set | Purpose |
|---|---|---|
| `VOICE_SERVICE_URL` | Vercel backend | `http://<VM_IP>:5000` — update on VM restart |
| `VOICE_SECRET` | Vercel backend + VM | Shared secret for VM auth |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | VM agent `.env` | LiveKit server connection |
| `LIVEKIT_SIP_TRUNK_ID` | VM cortex_voice `.env` | Telnyx SIP trunk ID |
| `OPENAI_API_KEY` | VM agent `.env` | Realtime API key |
| `DEEPGRAM_API_KEY` | VM agent `.env` | STT + TTS (Groq mode) |
| `AGENT_MODE` | VM agent `.env` | `realtime` or `groq` |

---

*Tenant IDs, IPs, and API keys are deployment-specific — configure in Vercel, Supabase dashboard, and GCP, not in this file.*
