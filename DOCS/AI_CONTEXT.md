# CortexFlow — AI Tool Context Document

> Paste this into any AI coding assistant, LLM, or agent at the start of a session to give it accurate context about the product and codebase.

---

## Product Introduction

CortexFlow is a **multi-tenant B2B SaaS platform** that combines a modern CRM with an **AI-powered outbound calling engine**. It is built and operated by a small team as a pilot-ready product. The core value proposition: when a lead arrives from any source (web form, ad platform, marketplace), CortexFlow automatically notifies the team, fires an AI phone call to the lead within minutes, conducts a real conversation (in Hindi, Hinglish, or English), books appointments or records outcomes, and surfaces everything in a clean CRM — with WhatsApp and email notifications at every step.

The system is currently in active use with a pilot customer (tenant: Acme Real Estate, for testing). The product is demonstrable end-to-end and working in production, but not yet hardened for at-scale multi-tenant SaaS sales.

---

## Tech Stack

### CRM Frontend
- **Framework**: Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Auth**: Supabase Auth with `@supabase/ssr` server-side sessions
- **Hosting**: Vercel (project: `crm`, domain: `crm.cortexflow.in`)
- **State**: React `useState`/`useCallback`/`useRef` — no global state manager
- **Polling**: Silent background polling with `setInterval` (no loading flash during polls)
- **Notifications**: Custom `useLeadNotifications` hook + `NotificationToast` component (new lead + appointment toasts)
- **Deployment**: `npx vercel deploy --prod --yes` from `crm/` directory

### Backend API
- **Framework**: Node.js, Express 4
- **Hosting**: Vercel (project: `cortex-backend-api`, URL: `cortex-backend-api.vercel.app`)
- **Database**: Supabase Postgres via `pg` pool (IPv4 session pooler)
- **Notifications**: Twilio WhatsApp API + Resend email API (both currently in sandbox/test mode)
- **Credentials**: Per-tenant encrypted API key store in Postgres
- **Jobs**: Vercel Cron (call scheduler + appointment reminders)
- **Entry**: `backend/server.js`; all routes under `/v1`

### Voice Service (GCP VM)
- **VM**: Google Cloud Platform (e2 instance), Ubuntu
- **External IP**: Dynamic (changes on VM restart) — update `VOICE_SERVICE_URL` in Vercel backend env
- **Process manager**: PM2 (auto-start on boot via systemd)
- **Public port**: 5000 (TCP) → `cortex_voice` Node.js service

### AI Call Pipeline (LiveKit Architecture)
- **cortex_voice** (`voice-service/src/`): TypeScript/Express on port 5000. Receives `/voice/start-call`, creates LiveKit room, dispatches Python agent, bridges SIP.
- **LiveKit Server** (`cortex-livekit` PM2): WebRTC media server
- **LiveKit SIP** (`cortex-sip` PM2 → Docker `livekit/sip:latest`): SIP bridge to Telnyx
- **Python Agent** (`cortex-agent` PM2 → `voice-service/agent/main.py`): LiveKit Agents SDK
- **Telephony**: Telnyx (SIP trunk, PSTN calls)

### AI Models Used
| Mode | STT | LLM | TTS |
|---|---|---|---|
| `realtime` (default) | Built-in | OpenAI `gpt-4o-realtime-preview` | Built-in (shimmer voice) |
| `groq` | Deepgram Nova-2 | Groq `llama-3.3-70b-versatile` | Deepgram Aura-2 |

### External Services
| Service | Purpose |
|---|---|
| Supabase | Postgres DB + Auth (shared by CRM and backend) |
| Vercel | CRM + Backend hosting |
| GCP | VM for real-time voice processing |
| Telnyx | SIP/PSTN calls |
| OpenAI | Realtime API (voice agent) |
| Deepgram | STT + TTS (Groq mode) |
| Groq | LLM (Groq mode, very low latency) |
| Twilio | WhatsApp Business API (currently sandbox) |
| Resend | Transactional email |

---

## Repository Structure

```
AI calling and CRM/
├── crm/                   Next.js CRM (Vercel)
├── backend/               Express API (Vercel)
├── voice-service/         GCP VM services
│   ├── src/               Node.js cortex_voice
│   └── agent/             Python LiveKit Agent
├── landing/               Marketing site (separate)
└── DOCS/                  Documentation (this folder)
```

---

## Key Design Decisions & Constraints

1. **VM IP is dynamic**: The GCP VM has no static IP. Every time the VM restarts, `VOICE_SERVICE_URL` in Vercel backend env vars must be updated manually. Script at `~/cortexflow-status.sh` on the VM shows the current IP.

2. **cortex_voice as the public gateway**: Only port 5000 is open on the VM's GCP firewall. All voice service API calls go through `cortex_voice` (Node.js). The Python agent posts back to `cortex_voice` locally (not to Vercel) via `VOICE_SERVICE_URL=http://localhost:5000`.

3. **LiveKit architecture, not FreeSWITCH**: The old FreeSWITCH pipeline is deprecated. All production calls go through LiveKit. FreeSWITCH Docker container is still running but not used for new calls.

4. **Notifications are best-effort**: All notification sends (WhatsApp, email) are wrapped in `Promise.allSettled` — they never block lead creation or call result processing.

5. **Multi-tenancy is tenant_id scoped**: All data access is scoped by `tenant_id`. Credentials are stored per-tenant in the `integrations` table (encrypted). Admin email/phone falls back to global env vars if not set per-tenant.

6. **Twilio is in sandbox**: WhatsApp messages currently only deliver to phones registered in the Twilio sandbox. For production, a WhatsApp Business API approval and real number are required.

7. **Call outcomes drive notifications**: `appointment_booked` → WhatsApp + Email to both sides. `callback` → WhatsApp only to both sides. New lead → 4x (WhatsApp + Email to admin + lead).

8. **Agent language**: Hindi/Hinglish first. Agent adapts to caller's language naturally. Greeting is always `"Namaste [name] ji, main [company] se baat kar raha hoon"`. Agent waits silently after greeting for the lead to respond.

---

## Current Capabilities

- Multi-tenant CRM with Supabase Auth
- Lead capture from 10+ sources (Meta, Google, IndiaMART, Justdial, Zapier, etc.)
- AI outbound calls in Hindi/Hinglish/English via LiveKit + OpenAI Realtime
- Function-tool based appointment booking and call termination
- Clean SIP hangup with farewell buffer
- Post-call WhatsApp + email notifications (appointment and callback outcomes)
- Manual notification trigger from CRM lead detail
- Appointment reminder cron (24h + 3h before)
- Real-time CRM updates during live calls (silent polling)
- Chat-bubble transcript display
- Communications timeline per lead
- Dashboard stats, pipeline board, appointments calendar
- Data import/export (CSV)
- PM2 auto-start on VM boot

---

## Known Limitations

- **VM IP changes on restart** — manual `VOICE_SERVICE_URL` update needed each time
- **Twilio sandbox** — WhatsApp messages only reach sandbox-registered numbers
- **No voicemail/AMD detection** — agent may speak to voicemail recordings
- **Single VM capacity** — approximately 3-5 concurrent calls on current VM specs
- **No recording consent prompt** — legally required for India/US but not yet implemented
- **Per-tenant admin contacts** — admin email/phone falls back to global env var, not tenant-specific yet
- **No self-serve onboarding** — new tenants must be provisioned manually in Supabase
- **No billing system** — Stripe or equivalent not yet integrated
- **No staging environment** — dev works against production Supabase

---

## Space for Improvement (Roadmap to Production-Grade)

### Immediate (weeks)
- Static IP for VM (eliminates IP update friction)
- Twilio WhatsApp Business API approval (real delivery)
- Resend domain verification (professional from-address)
- Per-tenant admin email/phone in tenant settings

### Short-term (1-2 months)
- Voicemail/AMD detection and graceful handling
- Recording consent prompt at call start (legal compliance)
- Uptime monitoring (UptimeRobot on `/health`)
- Sentry error tracking for CRM + backend
- Self-serve tenant onboarding flow

### Medium-term (3-6 months)
- Multi-VM scaling for concurrent calls
- Groq mode as default (lower latency, comparable quality)
- Staging environment (separate Supabase project, Vercel preview)
- Stripe billing + plan limits
- Formal QA: call quality recordings, cross-browser CRM testing
- GDPR / Indian IT Act data processing compliance

### Long-term (production SaaS)
- Multi-region voice infrastructure
- Custom voice cloning (ElevenLabs per tenant)
- Inbound call handling (not just outbound)
- CRM mobile app
- Analytics dashboard with conversion funnels
- WhatsApp bot (not just notifications — full conversational flow)
- SLA-backed support plan

---

*This document is intended for copy-pasting into AI tools. It reflects the actual production state as of April 2026.*
