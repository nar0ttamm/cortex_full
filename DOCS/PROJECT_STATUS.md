# CortexFlow — Project Status & Sell-Ready Checklist

> Last updated: 5 May 2026 — V2 Phases 1–11 complete, code committed and deployed to Vercel.

**Legend:** `[x]` done · `[-]` partial / needs improvement · `[ ]` not started

---

# ══════════════════════════════════════════════
# CORTEXFLOW V1 — PILOT READY (Archived: 27 April 2026)
# ══════════════════════════════════════════════

> **V1 Status: COMPLETE — Pilot Ready.** All features below were working in production as of 27 April 2026. V1 pilot tenant (Acme Real Estate) is live and operational. Do not remove or break any V1 functionality.

## 1. CRM (`crm/` — Next.js on Vercel)

### Done
- [x] Supabase auth, protected routes, middleware session management
- [x] Dashboard: stats, analytics charts, recent activity
- [x] Leads list, pipeline board, lead detail with notes
- [x] Communications timeline (WhatsApp, email, call logs per lead)
- [x] Appointments calendar (month view + day detail)
- [x] Calls page: full call history with outcomes, duration, summaries
- [x] Chat-style call transcript rendering in lead detail
- [x] Silent background polling (no loading flash during live calls)
- [x] Appointment booked toast notification (purple, with date)
- [x] New lead toast notification
- [x] Manual "Send Notification" button in lead detail (appointment confirmation + callback reminder)
- [x] Data import (CSV) / export
- [x] Integrations management UI (webhook URLs, test connect)
- [x] Tenant settings page
- [x] No technical mentions in user-facing pages (cleaned)
- [x] Skeleton loading states across pages
- [x] Dark mode support

### V1 Remaining (deprioritised for V2)
- [ ] Mobile layout QA (currently desktop-first)
- [ ] Sentry or equivalent client-side error reporting
- [ ] Billing / plan limits (Stripe integration)
- [ ] In-app help / onboarding tooltips

---

## 2. Backend API (`backend/` — Express on Vercel)

### Done
- [x] Lead ingest with idempotency check, 4x notifications on new lead
- [x] Calls start (proxy to VM), call result (update lead + post-call notifications)
- [x] Post-call notifications: appointment (WhatsApp + Email to admin + lead), callback (WhatsApp only)
- [x] Manual notification endpoint (`POST /v1/notifications/send`)
- [x] Integration webhooks + `leadNormalizer` (Meta, IndiaMART, Justdial, generic, etc.)
- [x] Appointment scheduling + reminder cron (24h + 3h before)
- [x] Credentials store (Resend, Twilio keys per tenant, encrypted)
- [x] Vercel Cron jobs for call scheduler + appointment reminders
- [x] Email inbound webhook (Resend → logs lead replies to communications)
- [x] Health check

### V1 Remaining (deprioritised for V2)
- [ ] Rate limiting on public webhook endpoints
- [ ] Per-tenant admin email/phone in settings (currently falls back to global env)
- [ ] Structured logging and error alerting (Vercel logs only right now)
- [ ] Load test for concurrent call starts

---

## 3. GCP VM (Telephony Host)

### Done
- [x] PM2 auto-start on VM boot (systemd enabled, `pm2 save` done)
- [x] All 4 services online: `cortex-livekit`, `cortex-sip`, `cortex-agent`, `cortex_voice`
- [x] Docker containers: `cortex-sip-container` (via PM2 shell script), `freeswitch` (restart: unless-stopped)
- [x] Startup check script: `bash ~/cortexflow-status.sh` — shows service status + IP
- [x] Telnyx SIP trunk configured in LiveKit SIP
- [x] GCP firewall: TCP 5000 open

### V1 Remaining (carry to V2 ops)
- [ ] Static IP in GCP (eliminates manual IP update step, ~₹600/month)
- [ ] Uptime monitoring on `/health` endpoint (UptimeRobot or similar)
- [ ] VM disk + memory monitoring
- [ ] SSH key rotation story + least-privilege service account

---

## 4. AI Voice Pipeline (`voice-service/`)

### Done
- [x] LiveKit architecture (replaced FreeSWITCH pipeline)
- [x] OpenAI Realtime mode: single WebSocket, ultra-low latency
- [x] Groq mode: Deepgram STT + Groq LLM + Deepgram TTS (higher quality option)
- [x] Hindi/Hinglish first, language adaptation to caller
- [x] `book_appointment` function tool → ISO date stored, CRM updated
- [x] `end_call` function tool → 4-second farewell buffer → clean SIP hangup
- [x] Tenant name in greeting: `"Namaste [name] ji, main [company] se baat kar raha hoon"`
- [x] Agent waits for response after greeting (no cutting off)
- [x] Appointment booking → Supabase lead update → CRM calendar reflects it
- [x] Call transcript saved → chat-bubble display in CRM

### V1 Remaining (carry to V2)
- [ ] Voicemail / AMD detection (currently: agent may speak to voicemail)
- [ ] Max concurrent call capacity documented (current VM: ~3-5 simultaneous)
- [ ] Conversation quality QA recordings (formal pass/fail criteria)
- [ ] Recording consent prompt (legal requirement for India/US)

---

## 5. Notifications (V1)

### Done
- [x] New lead: 4x (WhatsApp admin, WhatsApp lead, Email admin, Email lead)
- [x] Appointment booked after call: WhatsApp + Email to admin + lead
- [x] Callback after call: WhatsApp only to admin + lead
- [x] Appointment reminder cron: 24h + 3h before (WhatsApp to lead)
- [x] Manual send from CRM: appointment confirmation + callback reminder buttons in lead detail
- [x] All notifications logged to `communications_log` in lead metadata

### V1 Remaining
- [ ] **Move Twilio off sandbox** (WhatsApp Business API approval needed)
- [ ] **Resend domain verification** for custom from-address
- [ ] Per-tenant WhatsApp number support (currently global)
- [ ] SMS fallback if WhatsApp not delivered

---

# ══════════════════════════════════════════════
# CORTEXFLOW V2 — STARTED 28 APRIL 2026
# ══════════════════════════════════════════════

> **V2 Goal:** Project-centric AI sales operating system with self-serve onboarding, team hierarchy, project knowledge bases, OAuth integrations, Google Calendar sync, activity logs, and improved calling-agent context injection.

---

## PHASE 1 — LANDING PAGE DEMO FLOW

- [x] "Book Demo" CTA button added in landing hero section
- [x] Demo modal/popup: collects name + WhatsApp number
- [x] Backend: `POST /v1/demo/request` endpoint created
- [x] `demo_requests` Supabase table with full status tracking fields
- [x] Demo request triggers AI call immediately (primary action)
- [x] WhatsApp Business API template message sent as fallback
- [x] WhatsApp button interaction → retry demo call
- [x] Status fields: `whatsapp_sent`, `whatsapp_clicked`, `call_triggered`, `call_completed`, `call_completed_at`, `error_log`

---

## PHASE 2 — CLIENT ONBOARDING + TENANT CREATION

- [x] "Sign Up" / "Get Started" from landing redirects to onboarding flow
- [x] Step 1: name, company name, phone number, email
- [x] Step 2: position/role, industry type, address, GSTIN (optional)
- [x] Step 3: plan selection cards (Starter / Growth / Enterprise) + "3 day trial" note
- [x] On submit: Supabase Auth user created
- [x] Tenant created and linked to user
- [x] User assigned as tenant admin
- [x] `onboarding_completed` flag set on tenant
- [x] Auto-login and redirect to CRM dashboard
- [x] First CRM login: prompt to create first project (optional, not blocking)

---

## PHASE 3 — PROJECT-CENTRIC CRM ARCHITECTURE

- [x] `projects` table created (tenant_id, name, description, team_id, status)
- [x] `teams` table created (tenant_id, name, manager_id)
- [x] `team_members` table created (team_id, user_id, role)
- [x] `leads` table: `project_id` column added
- [x] `calls` table: `project_id` column added
- [x] `knowledge_bases` table created (tenant_id, project_id, type, content JSONB)
- [x] `kb_products` table created (project_id, name, property_type, location, price_range, size, possession_status, amenities)
- [x] `activity_logs` table created (see Phase 7)
- [x] `user_profiles` table created (user_id, tenant_id, role, full_name, phone)
- [x] `appointments` table created (tenant_id, lead_id, project_id, scheduled_at, google_event_id, status)
- [x] Backend: all queries scoped by tenant_id + project_id where applicable
- [x] Managers see only their team/project data
- [x] Executives see only assigned/team leads

---

## PHASE 4 — CRM UI CHANGES

- [x] Sidebar: "Pipeline" item removed
- [x] Sidebar: "Team" button added below Integrations
- [x] Leads page: List View / Kanban View toggle
- [x] Leads page: Kanban/Pipeline component reused inside Leads page
- [x] Leads page: filter by project, team, assigned user, status
- [x] Top-right: "Add New Project" button added
- [x] Project creation wizard — Step 1: name, description
- [x] Project creation wizard — Step 2: lead source selection OR CSV/Excel import
- [x] Project creation wizard — Step 3: Knowledge Base / Products (multiple products with all fields)
- [x] Project creation wizard — Step 4: assign/create team (auto-assign for managers)

---

## PHASE 5 — TEAM + ROLE SYSTEM

- [x] Admin role: full control, create/edit/delete teams, create users, assign roles
- [x] Manager role: own team access only, own projects only
- [x] Executive role: assigned/team leads only
- [x] Admin creates users manually with email + password (no invite links yet)
- [x] Permission guards implemented in backend (not just frontend)
- [x] Role middleware on all sensitive routes
- [x] "Team" page in CRM: list team members, add/remove, change roles
- [x] User creation UI for admin

---

## PHASE 6 — GOOGLE CALENDAR SYNC

- [x] Google Calendar OAuth flow (admin-only)
- [x] `google_calendar_tokens` table: tenant_id, access_token, refresh_token, calendar_id, expiry
- [x] Appointments saved internally first (DB is source of truth)
- [x] If Google sync enabled: create Google Calendar event on appointment
- [x] `google_event_id` stored on appointment record
- [x] Meeting/invite link sent to lead if available
- [x] Token refresh handled automatically

---

## PHASE 7 — ACTIVITY LOGGING

- [x] `activity_logs` table: tenant_id, project_id, user_id, action_type, entity_type, entity_id, metadata JSONB, created_at
- [x] Log: lead import, lead export, manual lead creation, integration lead received
- [x] Log: demo request, WhatsApp template sent, WhatsApp button interaction
- [x] Log: call triggered, call completed
- [x] Log: appointment booked, project created, team created, user created
- [x] Log: integration connected/disconnected
- [x] Activity history shown in Data panel or dedicated logs section in CRM

---

## PHASE 8 — META + GOOGLE ADS OAUTH INTEGRATIONS

- [x] Meta OAuth flow: authorize → exchange token → long-lived token
- [x] Fetch + select Meta pages, store page_id + page_access_token
- [x] Subscribe page(s) to leadgen webhook via Meta Graph API
- [x] Store page_id → tenant_id/project_id mapping
- [x] Meta webhook: verify challenge, receive leadgen, deduplicate, fetch lead details, normalize, store, trigger workflow
- [x] Google Ads OAuth flow: authorize → store tokens securely
- [x] Google Ads: map connected account to tenant/project
- [x] Google Ads: incoming leads normalized into existing lead ingestion flow
- [x] All integration actions logged in activity_logs
- [x] Required env vars documented in DOCS

---

## PHASE 9 — KNOWLEDGE BASE SYSTEM

- [x] Tenant-level KB: company tone, brand voice, calling rules, company instructions
- [x] Project-level KB: structured product/property entries
- [x] KB stored in Supabase (tenant_id + project_id scoped)
- [x] Multiple products/properties per project
- [x] KB editable from CRM project detail page
- [x] Structured JSON storage (not just free-text)

---

## PHASE 10 — CALLING STACK KB INJECTION

- [x] `/v1/calls/start` fetches: lead, tenant KB, project KB, project products
- [x] Context payload sent to voice-service
- [x] voice-service passes context to Python agent
- [x] Agent builds dynamic instructions: system rules + tenant KB + project KB + lead context
- [x] Agent uses Hindi/Hinglish naturally
- [x] Agent suggests only products from project KB (no hallucination)
- [x] Agent respects tenant tone and project-specific details
- [x] `book_appointment` and `end_call` tools continue working
- [x] KB summarized/structured to avoid huge prompts

---

## PHASE 11 — TRANSCRIPT FIX

- [x] Agent/STT layer instructed to produce transcripts in English Latin script
- [x] Backend detects non-Latin scripts in transcript
- [x] Fallback: OpenAI converts non-Latin transcript to English Latin script
- [x] Normalized transcript stored and displayed in CRM
- [x] Raw transcript preserved optionally for debugging

---

## PHASE 12 — SAFETY, TESTING, DEPLOYMENT

- [x] Build verified: landing (npm run build — 0 errors, all static pages generated)
- [x] Build verified: CRM TypeScript (npx tsc --noEmit — 0 errors)
- [x] Build verified: CRM full next build (npx next build — 0 errors, all routes compiled)
- [x] Build verified: backend (all 7 new V2 JS routes load cleanly via node require)
- [x] Supabase migrations applied and verified (all 19 V2 tables confirmed live)
- [ ] Auth/session flows tested end-to-end (manual — requires live env)
- [ ] V2 env vars added to Vercel project settings (manual — requires 3rd party credentials)
- [x] DOCS updated with new env vars and setup steps
- [x] Deployed to Vercel: landing (www.cortexflow.in), CRM (crm.cortexflow.in), backend (cortex-backend-api.vercel.app)
- [ ] V1 pilot tenant verified still working after V2 deploy (manual — test on live URL)

---

## New Environment Variables Required (V2)

| Variable | Service | Purpose |
|---|---|---|
| `META_APP_ID` | backend | Meta OAuth app ID |
| `META_APP_SECRET` | backend | Meta OAuth app secret |
| `META_WEBHOOK_VERIFY_TOKEN` | backend | Meta webhook challenge token |
| `GOOGLE_CLIENT_ID` | backend | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | backend | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | backend | Google OAuth redirect URI |
| `NEXT_PUBLIC_BACKEND_URL` | CRM | Public backend URL for onboarding flow |
| `ONBOARDING_SECRET` | backend | Secret for self-serve tenant creation |

---

*V1 is archived above and remains in production. V2 is being built on top of V1 without breaking existing functionality.*
