# CortexFlow — AI Calling & CRM Platform
> **Source of Truth** · Last updated: March 2026

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Database Schema](#5-database-schema)
6. [Backend API Endpoints](#6-backend-api-endpoints)
7. [Environment Variables](#7-environment-variables)
8. [External Integrations](#8-external-integrations)
9. [Lead Flow (End-to-End)](#9-lead-flow-end-to-end)
10. [Deployment](#10-deployment)
11. [Feature Milestones & Checklist](#11-feature-milestones--checklist)
12. [Development Workflow](#12-development-workflow)
13. [Known Limitations & TODOs](#13-known-limitations--todos)

---

## 1. Project Overview

CortexFlow is a multi-tenant SaaS CRM with AI-powered lead management. When a new lead enters the system, the platform automatically:
- Sends email + WhatsApp notifications to the admin and lead
- Schedules an AI phone call via Exotel within 2 minutes
- Records the call, transcribes it via Deepgram, and analyzes it via Gemini
- Schedules appointment reminders automatically
- Logs all communications (email, WhatsApp, calls) per lead in the CRM

**Live URLs:**
- CRM: https://crm.cortexflow.in
- Landing: https://cortexflow.in (or landing Vercel URL)
- Backend API: https://cortex-backend-api.vercel.app

**Default Tenant ID:** `b50750c7-0a91-4cd4-80fa-8921f974a8ec`

---

## 2. Architecture

```
┌─────────────────────┐    ┌──────────────────────────┐
│   Landing Page      │    │   CRM (Next.js)           │
│   (Next.js)         │    │   crm.cortexflow.in        │
│   cortexflow.in     │    │                            │
└──────────┬──────────┘    └────────────┬───────────────┘
           │                            │
           │ POST /v1/lead/ingest        │ /api/stats, /api/sheets
           ▼                            ▼
┌──────────────────────────────────────────────────────┐
│              Backend API (Express/Node.js)            │
│              cortex-backend-api.vercel.app            │
│                                                        │
│  routes/   services/   jobs/   utils/   config/       │
└──────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐
│   Supabase Postgres  │
│   (Database)         │
│   Tables: tenants,   │
│   leads, credentials │
└──────────────────────┘
```

**Lead processing pipeline (post-n8n, fully backend-orchestrated):**
```
Lead Ingest → Notifications (Email+WhatsApp) → Schedule Call
                                                    ↓
                                          Cron (every 1 min)
                                                    ↓
                                          Exotel AI Call
                                                    ↓
                                    Webhook → Deepgram → Gemini
                                                    ↓
                                          Update Lead + Log
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| CRM Frontend | Next.js 15, React, TypeScript, Tailwind CSS v3 |
| Landing Page | Next.js 15, React, TypeScript, Tailwind CSS |
| Backend API | Node.js, Express.js |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (`@supabase/ssr`) |
| AI Calling | Exotel (call initiation + TwiML) |
| Transcription | Deepgram |
| AI Analysis | Google Gemini |
| Email | Resend |
| WhatsApp | Twilio (sandbox → live after KYC) |
| Cron (prod) | cron-job.org (external, Vercel Hobby limitation) |
| Cron (dev) | node-cron (local) |
| Deployment | Vercel (all 3 subprojects) |
| Version Control | GitHub (4 repos) |

---

## 4. Repository Structure

```
AI calling and CRM/          ← Root workspace (no repo)
├── CORTEXFLOW.md            ← This file (source of truth)
├── backend/                 ← GitHub: cortex_backend
│   ├── server.js            ← Express entry point
│   ├── config/index.js      ← All env var access
│   ├── routes/
│   │   ├── leads.js         ← Lead CRUD + ingest + notes
│   │   ├── calls.js         ← Exotel webhooks + TwiML
│   │   ├── appointments.js  ← Appointment scheduling
│   │   ├── credentials.js   ← Credential retrieval
│   │   ├── admin.js         ← Admin + tenant management
│   │   ├── internal.js      ← Cron-triggered endpoints
│   │   └── email.js         ← Resend inbound webhook
│   ├── services/
│   │   ├── leadService.js
│   │   ├── notificationService.js
│   │   ├── aiService.js     ← Deepgram + Gemini
│   │   └── callService.js   ← Exotel + TwiML
│   ├── jobs/
│   │   ├── callScheduler.js ← Process pending calls
│   │   ├── reminderJob.js   ← Appointment reminders
│   │   └── index.js         ← node-cron entry (dev only)
│   ├── db.js                ← pg Pool connection
│   ├── encryption.js        ← AES credential encryption
│   └── vercel.json
│
├── crm/                     ← GitHub: cortex_crm
│   ├── app/
│   │   ├── page.tsx         ← Dashboard
│   │   ├── leads/           ← Lead list + detail + [id]
│   │   ├── pipeline/        ← Kanban board
│   │   ├── analytics/       ← Charts + funnel
│   │   ├── communications/  ← Per-lead comms log
│   │   ├── appointments/    ← Calendar view
│   │   ├── data/            ← Import/export/manual
│   │   ├── tenant/          ← Business settings
│   │   ├── login/ signup/   ← Auth pages
│   │   ├── components/
│   │   │   ├── AppShell.tsx      ← Main layout + dark mode
│   │   │   ├── Sidebar.tsx       ← Collapsible nav + logout
│   │   │   └── NotificationToast.tsx
│   │   ├── contexts/NotificationContext.tsx
│   │   ├── hooks/useLeadNotifications.ts
│   │   └── api/             ← Next.js API routes
│   ├── lib/
│   │   ├── supabase-client.ts   ← Backend API client
│   │   ├── auth.ts              ← requireAuth helper
│   │   └── supabase/            ← Supabase SSR clients
│   └── middleware.ts            ← Route protection
│
└── landing/                 ← GitHub: cortex_landing
    └── app/page.tsx         ← Marketing landing page
```

---

## 5. Database Schema

**Supabase PostgreSQL** — managed via Supabase dashboard.

### `tenants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | Tenant identifier |
| name | TEXT | Business name |
| slug | TEXT | URL slug |
| status | TEXT | active/inactive |
| settings | JSONB | Profile fields (see below) |
| created_at | TIMESTAMPTZ | |

**`settings` JSONB fields:**
- `owner_name`, `contact_email`, `whatsapp_number`, `phone_number`
- `business_type`, `website`, `timezone`
- `call_delay_seconds` (default: 120)

### `leads`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants.id |
| name | TEXT | |
| phone | TEXT | Unique per tenant |
| email | TEXT | |
| inquiry | TEXT | |
| source | TEXT | CRM / Landing / CSV |
| status | TEXT | new / interested / appointment_scheduled / confirmed / not_interested / closed |
| metadata | JSONB | All dynamic fields (see below) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**`metadata` JSONB fields:**
- `ai_call_status` — Pending / Completed / Failed
- `call_transcript` — Full call transcript text
- `call_result` — interested / not_interested / callback
- `call_initiated` — boolean
- `scheduled_call_at` — ISO timestamp
- `last_call_at` — ISO timestamp
- `appointment_date` — ISO timestamp
- `appointment_status` — Not Scheduled / Scheduled / Confirmed / Completed / Cancelled
- `reminder_1day_sent`, `reminder_3hr_sent` — boolean
- `calling_mode` — simulated / live
- `communications_log` — Array of `{ type, direction, message, subject, status, timestamp }`
- `notes` — Array of `{ id, text, author, timestamp }`

### `credentials`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| service | TEXT | twilio / resend / exotel / deepgram / gemini |
| encrypted_data | TEXT | AES-256 encrypted JSON |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

---

## 6. Backend API Endpoints

**Base URL:** `https://cortex-backend-api.vercel.app`

### Lead Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/v1/lead/ingest` | Create lead + trigger notifications + schedule call |
| GET | `/v1/leads/:tenantId` | List all leads for tenant |
| GET | `/v1/leads/:tenantId/:leadId` | Get single lead |
| GET | `/v1/lead/phone/:tenantId/:phone` | Find lead by phone |
| PATCH | `/v1/leads/:leadId` | Update lead status/metadata |
| POST | `/v1/leads/:leadId/notes` | Add note to lead |
| DELETE | `/v1/leads/:leadId/notes/:noteId` | Delete note from lead |
| POST | `/v1/lead/status` | Update lead status |
| POST | `/v1/lead/metadata` | Merge metadata (non-destructive) |

### Call Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/v1/call/flow` | Exotel TwiML response (webhook) |
| POST | `/v1/call/status` | Exotel call completion webhook |
| POST | `/v1/call/event` | Exotel event webhook |
| POST | `/v1/call/simulate` | Simulate a call (dev/test) |

### Appointment Endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/v1/appointment/schedule` | Schedule appointment |
| POST | `/v1/appointment/update` | Update appointment status |
| GET | `/v1/appointments/:tenantId` | List appointments for tenant |

### Credential Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/v1/credentials/:tenantId` | List services with credentials |

### Tenant Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/v1/tenant/:tenantId` | Get tenant profile + settings |
| PATCH | `/v1/tenant/:tenantId` | Update tenant name + settings |

### Admin Endpoints (require `x-admin-token` header)
| Method | Path | Description |
|---|---|---|
| POST | `/v1/admin/tenant` | Create new tenant |
| POST | `/v1/admin/credentials` | Store encrypted credential |
| DELETE | `/v1/admin/credentials` | Delete credential |

### Internal / Cron Endpoints (require `x-cron-secret` header)
| Method | Path | Description |
|---|---|---|
| POST | `/v1/internal/process-pending-calls` | Trigger pending call processing |
| POST | `/v1/internal/process-reminders` | Trigger appointment reminders |

### Email Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/v1/email/inbound` | Resend webhook verification |
| POST | `/v1/email/inbound` | Resend inbound email handler |

---

## 7. Environment Variables

### Backend (`backend/.env` / Vercel)
```env
DATABASE_URL=                  # Supabase connection string (transaction mode)
ENCRYPTION_KEY=                # 32-char AES encryption key for credentials
CALLING_MODE=simulated         # simulated | live
CALL_DELAY_SECONDS=120         # Delay before auto-calling new lead
BACKEND_URL=                   # This backend's URL (for Exotel callbacks)
DEFAULT_TENANT_ID=             # b50750c7-0a91-4cd4-80fa-8921f974a8ec
ADMIN_EMAIL=                   # Email for new lead notifications
ADMIN_PHONE=                   # WhatsApp number for admin alerts
ADMIN_TOKEN=                   # Secret for /v1/admin/* routes
CRON_SECRET=                   # Secret for /v1/internal/* routes
```

### CRM (`crm/.env.local` / Vercel)
```env
NEXT_PUBLIC_SUPABASE_URL=      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Supabase anon key
NEXT_PUBLIC_API_URL=           # Backend URL (https://cortex-backend-api.vercel.app)
NEXT_PUBLIC_DEFAULT_TENANT_ID= # b50750c7-0a91-4cd4-80fa-8921f974a8ec
```

### Stored Credentials (Supabase `credentials` table, per tenant)
- `twilio` → `{ account_sid, auth_token, from_number, whatsapp_from }`
- `resend` → `{ api_key, from_email }`
- `exotel` → `{ account_sid, api_key, api_token, subdomain, caller_id }`
- `deepgram` → `{ api_key }`
- `gemini` → `{ api_key }`

---

## 8. External Integrations

### Exotel (AI Calling)
- **Status:** Configured, pending KYC approval for live calls
- **Mode:** `CALLING_MODE=simulated` until KYC approved
- **Webhooks:** `POST /v1/call/flow` (TwiML), `POST /v1/call/status`
- **Setup:** Exotel dashboard → Applets → Configure webhook URLs

### Twilio (WhatsApp)
- **Status:** Sandbox active, live requires business verification
- **Sandbox:** Leads/admin must send `join <keyword>` to sandbox number
- **From number stored in:** `credentials.twilio.whatsapp_from`

### Resend (Email)
- **Status:** Active (free tier)
- **API Key:** Stored in `credentials.resend.api_key`
- **Inbound replies:** Routed to `POST /v1/email/inbound` via Resend webhook
- **Inbound domain:** Set up in Resend dashboard → Domains → Inbound

### Deepgram (Transcription)
- **Status:** Configured, triggered after real Exotel calls
- **Usage:** Called in `POST /v1/call/status` after recording URL received

### Gemini (AI Analysis)
- **Status:** Configured
- **Usage:** Analyzes call transcript to extract: `{ interested, appointment_requested, call_result, summary }`

### cron-job.org (External Cron)
- **Job 1:** Every 1 minute → `POST /v1/internal/process-pending-calls`
  - Header: `x-cron-secret: <CRON_SECRET>`
- **Job 2:** Every 1 hour → `POST /v1/internal/process-reminders`
  - Header: `x-cron-secret: <CRON_SECRET>`

---

## 9. Lead Flow (End-to-End)

### A. New Lead Entry
```
1. Lead submits landing page form OR manual CRM entry OR CSV import
2. POST /v1/lead/ingest
3. Lead saved to DB (status: new)
4. Parallel notifications:
   - Email → admin (new lead alert)
   - WhatsApp → admin (new lead alert)
   - Email → lead (thank you + call incoming)
   - WhatsApp → lead (call incoming)
5. metadata.scheduled_call_at = now + CALL_DELAY_SECONDS
6. metadata.call_initiated = false
```

### B. Call Scheduling (cron, every 1 min)
```
1. Find leads where scheduled_call_at <= now AND call_initiated = false
2. If CALLING_MODE = simulated: generate fake transcript, update lead
3. If CALLING_MODE = live: POST to Exotel API → initiate call
4. Set call_initiated = true
```

### C. Call Processing (Exotel Webhooks)
```
1. POST /v1/call/flow → return TwiML (play greeting, collect input)
2. POST /v1/call/status (on call end):
   - Download recording URL
   - Send to Deepgram → transcript
   - Send transcript to Gemini → { interested, appointment_requested, call_result }
   - Update lead status + metadata
   - If appointment_requested: set appointment_status = Scheduled
```

### D. Appointment Reminders (cron, every 1 hr)
```
1. Find leads with appointment_date within 24hr or 3hr
2. Send WhatsApp reminder if not already sent
3. Set reminder_1day_sent / reminder_3hr_sent = true
```

### E. Inbound Email Replies
```
1. Lead replies to email
2. Resend routes to POST /v1/email/inbound
3. Backend finds lead by sender email
4. Logs to metadata.communications_log
5. Visible in CRM Communications page
```

---

## 10. Deployment

### Vercel Projects
| Project | Vercel Name | Custom Domain | GitHub Repo |
|---|---|---|---|
| CRM | cortex_crm | crm.cortexflow.in | cortex_crm |
| Backend | cortex_backend | cortex-backend-api.vercel.app | cortex_backend |
| Landing | cortex_landing | cortexflow.in | cortex_landing |

### Deploy Commands
```bash
# Backend
cd backend && npx vercel --prod --yes

# CRM
cd crm && npx vercel --prod --yes

# Landing
cd landing && npx vercel --prod --yes
```

### After deploying backend: update Exotel webhook URLs in dashboard
- Call Flow: `https://cortex-backend-api.vercel.app/v1/call/flow`
- Call Status: `https://cortex-backend-api.vercel.app/v1/call/status`

---

## 11. Feature Milestones & Checklist

### ✅ Completed
- [x] Project structure — backend, CRM, landing (all on Vercel)
- [x] Supabase database — tenants, leads, credentials tables
- [x] Multi-tenant architecture with encrypted credential storage
- [x] Lead ingest endpoint (`POST /v1/lead/ingest`)
- [x] Notification system (email via Resend, WhatsApp via Twilio)
- [x] AI call scheduling via cron (simulated mode)
- [x] Exotel call flow + status webhooks
- [x] Deepgram transcription integration
- [x] Gemini AI analysis integration
- [x] Appointment scheduling + reminder cron
- [x] Inbound email webhook (Resend)
- [x] CRM Dashboard with stats + activity feed
- [x] CRM Leads page (table + mobile cards)
- [x] CRM Lead detail page with timeline
- [x] CRM Communications page (grouped by lead, admin filter)
- [x] CRM Appointments calendar view (custom calendar)
- [x] CRM Pipeline (Kanban drag-and-drop)
- [x] CRM Analytics page (charts: funnel, donut, bar, trend)
- [x] CRM Data page (import CSV, export, manual entry)
- [x] CRM Tenant settings page (full CRUD)
- [x] Collapsible sidebar with tooltips
- [x] CortexFlow branding in topbar
- [x] Lead notes (add/delete notes per lead)
- [x] Live notifications (polling badge + toast)
- [x] Dark mode toggle (persisted)
- [x] Logout button in sidebar
- [x] Mobile responsive CRM
- [x] Session refresh fix (middleware cookie mutation)
- [x] Backend fetch timeout (15s AbortController)
- [x] Dashboard auto-retry on 500 errors
- [x] All repos on GitHub (cortex_backend, cortex_crm, cortex_landing)

### 🔄 In Progress / Next Up
- [ ] **Exotel KYC** — Complete KYC to enable live calls (`CALLING_MODE=live`)
- [ ] **Twilio WhatsApp** — Business verification for production (exit sandbox)
- [ ] **8th feature (discussed)** — Multi-tenant onboarding / signup flow

### 📋 Future / Nice-to-Have
#### 8. Universal Inbound Webhook & Zapier Integration
> **Status: Planned — next major feature to build**

Right now leads enter CortexFlow only via the landing page form, manual CRM entry, or CSV import. This feature exposes a single generic inbound webhook endpoint — `POST /v1/webhook/:tenantId` — so **any external tool can push leads directly into CortexFlow**, triggering the full AI calling + notification pipeline automatically.

**Use cases this unlocks:**
- **Typeform / Tally / JotForm** — embed a lead form anywhere; on submit it POSTs straight to CortexFlow
- **IndiaMART / JustDial / Sulekha** — India's biggest B2B lead marketplaces send lead alerts via webhook; CortexFlow receives them directly
- **Facebook & Instagram Lead Ads** — every ad lead gets an AI call within 2 minutes of form fill
- **Zapier / Make (Integromat)** — connect 5,000+ apps (Google Sheets, LinkedIn, WhatsApp Business, HubSpot) in a no-code workflow
- **Custom websites / apps** — any dev sends `POST { name, phone, email, inquiry, source }` and gets the full AI workflow
- **WordPress, WooCommerce, Gravity Forms** — contact form submissions routed directly

**What gets built:**
1. `POST /v1/webhook/:tenantId` — accepts any JSON payload, normalizes common field name variants (`full_name`, `mobile`, `phone_number`, `message`, etc.), then calls the existing ingest pipeline
2. A **webhook secret key per tenant** stored in the `credentials` table — only authorized sources can push leads
3. A **Zapier-compatible 200 response** (`{ id, status }`) so Zaps can chain further actions
4. **Tenant Settings UI panel** — shows the webhook URL + API key with a "Regenerate Key" button

**Why it matters:** This turns CortexFlow from a standalone CRM into a **universal lead receiver**. No matter where the lead comes from — paid ads, directories, organic forms, partner portals — they all land in CortexFlow and get called by AI within 2 minutes. Zero manual copy-paste, zero missed leads.

- [ ] `POST /v1/webhook/:tenantId` generic inbound endpoint
- [ ] Webhook secret key per tenant
- [ ] Field mapping / normalization layer
- [ ] Zapier-compatible response format
- [ ] Tenant Settings UI: webhook URL + key management

---

- [ ] Lead import from Google Sheets
- [ ] Custom AI call scripts per tenant
- [ ] Lead scoring / AI priority ranking
- [ ] Team member accounts (multiple users per tenant)
- [ ] Billing / subscription management
- [ ] SMS channel (Twilio SMS)
- [ ] Custom domain per tenant

---

## 12. Development Workflow

### Local Setup
```bash
# Backend (port 4000)
cd backend
npm install
cp env.template .env   # fill in values
node server.js

# CRM (port 3000)
cd crm
npm install
# fill in .env.local (see env vars section)
npm run dev

# Landing (port 3001)
cd landing
npm install
npm run dev
```

### Git & Deployment Flow
```bash
# Make changes → test locally → push to GitHub → Vercel auto-deploys
git add -A
git commit -m "feat/fix/refactor: description"
git push origin main
```

### Adding a New Credential for a Tenant
```bash
curl -X POST https://cortex-backend-api.vercel.app/v1/admin/credentials \
  -H "Content-Type: application/json" \
  -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  -d '{
    "tenant_id": "b50750c7-0a91-4cd4-80fa-8921f974a8ec",
    "service": "resend",
    "data": { "api_key": "re_xxx", "from_email": "noreply@yourdomain.com" }
  }'
```

### Testing the Lead Flow
```bash
# Inject a test lead
curl -X POST https://cortex-backend-api.vercel.app/v1/lead/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "b50750c7-0a91-4cd4-80fa-8921f974a8ec",
    "name": "Test User",
    "phone": "9999999999",
    "email": "test@example.com",
    "inquiry": "Test inquiry",
    "source": "Manual"
  }'
```

---

## 13. Known Limitations & TODOs

### Vercel Hobby Plan Constraints
- Serverless functions: 10s execution limit
- No built-in cron < 1 day → using cron-job.org as external trigger
- Cold starts can delay first request (mitigated by retry logic in CRM)

### Current Limitations
- **Single tenant:** Hardcoded `DEFAULT_TENANT_ID` — no self-signup flow yet
- **Simulated calls:** `CALLING_MODE=simulated` until Exotel KYC approved
- **Twilio sandbox:** Leads must opt-in; production requires business verification
- **No call recording storage:** Exotel recording URL is temporary; not persisted to S3
- **No pagination:** Lead list loads all leads at once (fine up to ~1000 leads)

### Important Notes
- `NEXT_PUBLIC_*` vars are baked in at build time — redeploy after changing them
- Backend `.js` files are plain JavaScript — never use TypeScript syntax (`: type`) in them
- Supabase access tokens expire every hour; middleware handles refresh automatically
- All API credentials stored encrypted (AES-256) in the `credentials` table, never in env files per-tenant
