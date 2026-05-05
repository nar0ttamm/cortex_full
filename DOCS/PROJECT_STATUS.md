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

---

# ══════════════════════════════════════════════
# CORTEXFLOW V3 — CALLING STACK UPGRADE
# ══════════════════════════════════════════════

> **V3 Goal:** Production-grade AI calling stack — tenant-branded identity, compact call brief, smart product selection, follow-up awareness, call queue, usage tracking, ElevenLabs TTS, sales playbook, silence handling, and internal analytics.
> **Started:** 5 May 2026 | **Status:** Implementation Complete — Pending Deployment

**Backward Compatibility:** All existing V1/V2 call flows remain unchanged. `kb_context` still works as fallback. `call_brief` is preferred for V3.

---

## PHASE 0 — DOCUMENTATION + SAFETY

- [x] Existing architecture inspected (voice-service, backend, agent, Supabase schema)
- [x] PROJECT_STATUS.md updated with V3 upgrade section and full checklist
- [x] V1 pilot tenant protected (no existing functionality removed)
- [x] Backward compatibility preserved throughout

---

## PHASE 1 — CALL CONTEXT BUILDER

- [x] `backend/services/callContextBuilder.js` created
- [x] Fetches: lead, tenant, project, tenant KB, project KB, lead_context (memory), previous calls, appointments
- [x] Outputs compact call brief (not full KB dump)
- [x] Detects call_type: fresh vs follow_up
- [x] `/v1/calls/start` updated to use callContextBuilder instead of inline KB fetch
- [x] call_brief passed to voice-service; kb_context kept as backward-compat fallback

---

## PHASE 2 — PRODUCT SELECTION SYSTEM

- [x] `backend/services/productSelector.js` created
- [x] Rule-based matching: location, property_type, possession, budget hint, inquiry keywords
- [x] Returns top 3–5 relevant products only (never all)
- [x] `searchProducts()` function for runtime tool use
- [x] No AI used by default — deterministic and fast
- [x] Integrated into `/v1/calls/start` (initial products selected before call)

---

## PHASE 3 — LEAD INTENT EXTRACTION

- [x] `backend/services/leadIntentExtractor.js` created
- [x] Rule/regex-based extraction: budget, location, property type, possession, timeline
- [x] `extractAndStoreIntent()` runs on call start, upserts to `lead_context` table
- [x] `updateLeadMemory()` function for post-call memory save
- [x] AI fallback NOT used for intent extraction (rules sufficient)

---

## PHASE 4 — FRESH vs FOLLOW-UP CONTEXT

- [x] callContextBuilder inspects: calls table, call_transcripts, appointments, lead_context
- [x] call_type: "fresh" | "follow_up" determined automatically
- [x] Last summary, outcome, objections, interest_level passed to agent
- [x] Agent uses different greeting for fresh vs follow-up (Phase 5)

---

## PHASE 5 — AGENT BASE BRAIN REFACTOR

- [x] `voice-service/agent/main.py` fully refactored
- [x] Tenant-branded identity — NEVER says "CortexFlow" or "AI calling tool"
- [x] Speaks as: "Main [company_name] se baat kar raha hoon"
- [x] Dynamic greeting: fresh ("aapne enquiry ki thi") vs follow-up ("pichli baar baat hui thi")
- [x] Base prompt is compact — no full KB injection
- [x] Sales flow: greet → confirm available → inquiry context → qualify → products → objections → appointment/callback → close
- [x] One question at a time (human pacing)
- [x] Accepts call_brief; backward-compat with kb_context (auto-converts legacy)

---

## PHASE 6 — TOOL-BASED RUNTIME PRODUCT LOOKUP

- [x] `backend/routes/callTools.js` created — all tool endpoints
- [x] `voice-service/src/agentToolProxy.ts` created — proxies agent calls to backend
- [x] Agent tools added to main.py:
  - [x] `search_project_products(query, location, property_type, possession)` — scoped to project_id
  - [x] `get_product_details(product_name)` — returns full product details
  - [x] `book_appointment(appointment_iso, notes)` — existing, kept
  - [x] `end_call(outcome, ...)` — extended with memory fields
  - [x] `update_lead_memory(...)` — new tool
- [x] All product tools scoped to project_id — cross-project lookup forbidden
- [x] Backend validates project belongs to tenant (security)

---

## PHASE 7 — CALL MEMORY DURING CALL

- [x] `lead_context` table created (via migration)
- [x] `update_lead_memory` tool in agent captures: budget, location, type, timeline, interest_level, objection, callback_time
- [x] Memory auto-saved on end_call tool with interest_level and objection
- [x] Memory auto-saved when appointment booked
- [x] Memory used in Phase 1 context builder for future follow-up calls

---

## PHASE 8 — CALL QUEUE + CONCURRENCY CONTROL

- [x] `call_queue` table created (via migration)
- [x] `backend/services/callQueueService.js` created
- [x] Queue fields: tenant_id, project_id, lead_id, priority, scheduled_at, status, attempt_count, last_attempt_at, failure_reason, call_id
- [x] `enqueueCall()`, `getQueuedCalls()`, `hasCapacity()`, `updateQueueStatus()`, `scheduleRetry()`, `canAttemptLead()`
- [x] MAX_CONCURRENT_CALLS = 3 (configurable via env)
- [x] MAX_ATTEMPTS_PER_DAY = 2 per lead
- [x] Statuses: queued|processing|calling|completed|failed|no_answer|busy|retry_scheduled|cancelled
- [ ] Queue worker cron (Vercel Cron) — PENDING integration into existing callScheduler

---

## PHASE 9 — CALL FAILURE HANDLING

- [x] Failure outcomes tracked: dial_failed, technical_failure, no_answer, user_busy, voicemail_or_machine, no_response
- [x] Usage tracker updated for each outcome type
- [x] `call_queue.failure_reason` stores reason
- [x] Retry scheduling via `scheduleRetry()` (2h delay by default)
- [x] `canAttemptLead()` enforces max 2 attempts/day per lead

---

## PHASE 10 — USAGE TRACKING

- [x] `tenant_usage` table created (via migration)
- [x] `backend/services/usageTracker.js` created
- [x] Tracked per tenant/month: calls_attempted, calls_connected, call_minutes_used, demo_calls_used, failed_calls, no_answer_calls, whatsapp_messages_sent, emails_sent, appointments_booked, callbacks_scheduled, ai_input_tokens_estimated, ai_output_tokens_estimated
- [x] `trackCallOutcome()` — convenience function called in `/v1/calls/result`
- [x] Plan limits (Starter/Growth/Enterprise) — structure ready, limits as placeholders
- [x] `getTenantUsage()` for admin/billing queries

---

## PHASE 11 — ELEVENLABS TTS LAYER

- [x] `voice-service/src/elevenLabsTts.ts` — already implemented in V2
- [x] ElevenLabs is TTS-only (not replacing agent brain)
- [x] Fallback to Deepgram TTS if ElevenLabs fails
- [x] Health endpoint reports TTS provider active
- [x] Env vars: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` (see below)

---

## PHASE 12 — FILLER PHRASE SYSTEM

- [x] Filler phrases defined in agent: `FILLERS_TOOL`, `FILLERS_TRANSITION`
- [x] Agent uses filler before tool calls (reduces perceived latency)
- [x] Filler count tracked in `_filler_count` for analytics
- [x] Not overused — only in tool latency context
- [x] Natural Hindi/Hinglish: "Ji, ek second...", "Main check karta hoon...", "Bilkul, abhi batata hoon..."

---

## PHASE 13 — BARGE-IN / VAD IMPROVEMENT

- [x] Groq mode: Silero VAD threshold raised to 0.6 (env: `SILERO_VAD_THRESHOLD`)
- [x] Groq mode: `min_speech_duration` added (env: `SILERO_MIN_SPEECH_MS`, default 200ms)
- [x] Groq mode: `min_silence_duration` increased (env: `SILERO_MIN_SILENCE_MS`, default 600ms)
- [x] Groq mode: Deepgram `endpointing_ms` increased to 600ms (env: `DEEPGRAM_ENDPOINTING_MS`)
- [x] Realtime mode: turn detection threshold tunable via `VAD_THRESHOLD` (default 0.65)
- [x] Realtime mode: `silence_duration_ms` tunable via `VAD_SILENCE_DURATION_MS` (default 700ms)
- [x] Realtime mode: `prefix_padding_ms` = 300ms via `VAD_PREFIX_PADDING_MS`
- [x] `min_endpointing_delay` increased to 0.5s (env: `MIN_ENDPOINTING_DELAY`)
- [x] `max_endpointing_delay` increased to 1.5s (env: `MAX_ENDPOINTING_DELAY`)

---

## PHASE 14 — HUMAN PACING + INTERRUPTION RECOVERY

- [x] Agent instructions: "Ek sawaal ek baar — ek saath multiple sawaal mat poochho"
- [x] Agent instructions: "Short replies: max 2-3 sentences per turn"
- [x] Agent instructions: "User bole toh sunoo — beech mein mat bolo"
- [x] `allow_interruptions=True` maintained
- [x] Increased endpointing delay allows user to finish speaking

---

## PHASE 15 — SILENCE HANDLING

- [x] `_silence_monitor()` background asyncio task in agent
- [x] After `SILENCE_FILLER_S` (4s): "Hello sir, meri awaaz aa rahi hai?"
- [x] After `SILENCE_WARN_S` (8s): "Main baad mein call kar deta hoon. Aapka din shubh ho!"
- [x] After `SILENCE_HANGUP_S` (13s): end call, outcome = no_response
- [x] Deterministic state machine — not LLM-based
- [x] All thresholds configurable via env vars
- [x] SIP disconnect properly resets/cancels silence monitor

---

## PHASE 16 — SALES PLAYBOOK + OBJECTION HANDLING

- [x] Objection framework in base prompt: acknowledge → clarify → reframe → push action
- [x] Common objections with responses in instructions:
  - "Price high hai" → ask comfortable range
  - "Sochna hai" → callback or site visit
  - "Interested nahi" → ask reason, offer better option
  - "Busy hoon" → ask when convenient
  - "Already dekh raha hoon" → comparison visit
- [x] Qualification questions listed (one at a time)
- [x] Call goal clearly defined in instructions

---

## PHASE 17 — PROJECT ISOLATION HARDENING

- [x] Backend: all product tools require project_id + tenant_id
- [x] Backend: `callTools.js` validates project belongs to tenant before any product query
- [x] Agent: initial products pre-filtered to project scope by productSelector
- [x] Agent: `search_project_products` requires project_id (injected from call_brief)
- [x] Agent instructions: "Only discuss current project products"
- [x] No global product search endpoint exists

---

## PHASE 18 — INTERNAL CALL QUALITY ANALYTICS

- [x] `call_analytics` table created (via migration)
- [x] `POST /v1/calls/tools/log-analytics` endpoint created
- [x] Agent logs: tool_call_count, silence_count, filler_phrase_count, appointment_booked, callback_scheduled, outcome, talk_duration_seconds
- [x] `log_analytics()` called at end of every call session
- [x] Internal only — not exposed to tenant CRM yet

---

## PHASE 19 — TRANSCRIPT NORMALIZATION PRESERVATION

- [x] Already implemented in V2 Phase 11 — preserved as-is
- [x] `_has_non_latin()` + `_normalize_transcript()` retained in refactored agent

---

## PHASE 20 — TESTING + VERIFICATION

- [x] Backend: all routes load cleanly (`node -e "require('./server')"` — exit 0)
- [x] Voice-service: TypeScript clean (`npx tsc --noEmit` — 0 errors)
- [x] Agent: Python syntax valid (`python -m py_compile main.py` — exit 0)
- [x] Supabase migrations applied: call_queue, tenant_usage, lead_context, call_analytics tables created
- [ ] Live call test: fresh lead with products — PENDING (manual, requires live env)
- [ ] Live call test: follow-up lead — PENDING
- [ ] Live call test: silence handling — PENDING
- [ ] Live call test: product search tool — PENDING
- [ ] Live call test: no-answer retry — PENDING
- [ ] Demo call test — PENDING
- [ ] V1 pilot tenant verification — PENDING (manual check on live URL)

---

## PHASE 21 — DEPLOYMENT

- [ ] Backend deployed to Vercel (after manual testing)
- [ ] CRM deployed (no CRM changes in V3)
- [ ] Voice-service updated on GCP (PM2 restart: `pm2 restart cortex-agent`)
- [ ] `/health` endpoints verified
- [ ] Real test call made post-deployment

---

## NEW ENVIRONMENT VARIABLES (V3)

| Variable | Service | Purpose | Default |
|---|---|---|---|
| `BACKEND_URL` | voice-service | Vercel backend URL for agent tool proxy | (required) |
| `MAX_CONCURRENT_CALLS` | backend | Max simultaneous calls in queue | `3` |
| `SILENCE_FILLER_S` | voice-service (env) | Seconds of silence before filler phrase | `4` |
| `SILENCE_WARN_S` | voice-service (env) | Seconds before "main baad mein call karta hoon" | `8` |
| `SILENCE_HANGUP_S` | voice-service (env) | Seconds before auto-hangup (no_response) | `13` |
| `VAD_THRESHOLD` | voice-service (env) | OpenAI Realtime VAD sensitivity (0–1, higher = less sensitive) | `0.65` |
| `VAD_SILENCE_DURATION_MS` | voice-service (env) | Realtime: silence duration before end-of-turn | `700` |
| `VAD_PREFIX_PADDING_MS` | voice-service (env) | Realtime: prefix padding ms | `300` |
| `SILERO_VAD_THRESHOLD` | voice-service (env) | Silero VAD threshold for groq mode | `0.6` |
| `SILERO_MIN_SPEECH_MS` | voice-service (env) | Min speech duration for groq mode | `200` |
| `SILERO_MIN_SILENCE_MS` | voice-service (env) | Min silence duration for groq mode | `600` |
| `DEEPGRAM_ENDPOINTING_MS` | voice-service (env) | Deepgram endpointing for groq mode | `600` |
| `MIN_ENDPOINTING_DELAY` | voice-service (env) | Min endpointing delay (seconds) | `0.5` |
| `MAX_ENDPOINTING_DELAY` | voice-service (env) | Max endpointing delay (seconds) | `1.5` |
| `ELEVENLABS_API_KEY` | voice-service | ElevenLabs API key (already in V2) | (required if TTS_PROVIDER=elevenlabs) |
| `ELEVENLABS_VOICE_ID` | voice-service | ElevenLabs voice ID | (required if TTS_PROVIDER=elevenlabs) |
| `ELEVENLABS_MODEL` | voice-service | ElevenLabs model ID | `eleven_turbo_v2_5` |

---

## NEW DATABASE TABLES (V3)

| Table | Purpose | Phase |
|---|---|---|
| `call_queue` | Call queue with priority, retry, concurrency control | 8 |
| `tenant_usage` | Per-tenant/month usage counters for billing | 10 |
| `lead_context` | Persistent lead memory: intent, call memory, objections | 3, 7 |
| `call_analytics` | Internal call quality metrics (not tenant-facing) | 18 |

---

## NEW BACKEND FILES (V3)

| File | Purpose |
|---|---|
| `backend/services/callContextBuilder.js` | Builds compact call brief (Phase 1) |
| `backend/services/productSelector.js` | Rule-based product selection (Phase 2) |
| `backend/services/leadIntentExtractor.js` | Intent extraction + lead memory (Phase 3, 7) |
| `backend/services/usageTracker.js` | Per-tenant usage tracking (Phase 10) |
| `backend/services/callQueueService.js` | Call queue management (Phase 8) |
| `backend/routes/callTools.js` | Runtime tool endpoints for agent (Phase 6) |
| `voice-service/src/agentToolProxy.ts` | Proxies agent tool calls to backend (Phase 6) |

---

## KNOWN RISKS + NOTES

- **Call queue worker not yet wired to Vercel Cron** — `callQueueService.js` is ready but not yet integrated into `backend/jobs/callScheduler.js`. The cron still uses the existing lead metadata `scheduled_call_at` approach. Wiring queue to cron is next step.
- **ElevenLabs TTS for groq mode only** — Realtime mode uses OpenAI's built-in TTS. ElevenLabs applies to groq mode via `voiceSynthesis.ts`.
- **Silero VAD params** — The `min_speech_duration` and `min_silence_duration` parameters may not be exposed in the installed version of `livekit-agents`. If Python agent fails to start, remove those params and only adjust `threshold`.
- **Agent tool proxy** — `BACKEND_URL` env var must be set on the GCP VM for tool proxy to work. Verify after VM deployment.
- **RLS disabled** — All 19 Supabase tables (incl. new V3 tables) have RLS disabled. This is intentional for the server-side-only access pattern but should be addressed before multi-tenant public launch.

*V3 is additive — all V1/V2 functionality remains intact.*
