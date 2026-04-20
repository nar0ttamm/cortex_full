# CortexFlow — Project Status & Sell-Ready Checklist

> Last updated: April 2026 — reflects current working state.

**Legend:** `[x]` done · `[-]` partial / needs improvement · `[ ]` not started

---

## Honest current state

The system **works end-to-end in production**: leads are captured, AI calls are made via LiveKit + OpenAI Realtime, appointments are booked and logged in the CRM, WhatsApp and email notifications fire at every key event, and all data lands in Supabase. We are at **pilot-ready** stage — demonstrable and functional — but not yet hardened for at-scale SaaS sales.

---

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

### Remaining for sell-ready
- [ ] Self-serve onboarding flow (current: manual tenant provisioning)
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

### Remaining for sell-ready
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

### Quick ops reference (after VM restart)
1. VM starts → PM2 auto-restarts all 4 services
2. Run `bash ~/cortexflow-status.sh` to verify + get current IP
3. Update `VOICE_SERVICE_URL=http://<IP>:5000` in **Vercel backend** env vars and redeploy (or use Vercel CLI)
4. Calls will work again

### Remaining for sell-ready
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

### Remaining for sell-ready
- [ ] Voicemail / AMD detection (currently: agent may speak to voicemail)
- [ ] Max concurrent call capacity documented (current VM: ~3-5 simultaneous)
- [ ] Conversation quality QA recordings (formal pass/fail criteria)
- [ ] Recording consent prompt (legal requirement for India/US)

---

## 5. Notifications

### Done
- [x] New lead: 4x (WhatsApp admin, WhatsApp lead, Email admin, Email lead)
- [x] Appointment booked after call: WhatsApp + Email to admin + lead
- [x] Callback after call: WhatsApp only to admin + lead
- [x] Appointment reminder cron: 24h + 3h before (WhatsApp to lead)
- [x] Manual send from CRM: appointment confirmation + callback reminder buttons in lead detail
- [x] All notifications logged to `communications_log` in lead metadata

### Remaining for sell-ready
- [ ] **Move Twilio off sandbox** (see below)
- [ ] **Resend domain verification** for custom from-address
- [ ] Per-tenant WhatsApp number support (currently global)
- [ ] SMS fallback if WhatsApp not delivered

---

## Moving from Sandbox to Production Messaging

### Twilio WhatsApp — what needs to change
| Step | What to do |
|---|---|
| 1. Business verification | Submit business details to Twilio for WhatsApp Business API approval (takes 1-3 days) |
| 2. Get a real number | Purchase a WhatsApp-enabled Twilio number or bring your own via BYON |
| 3. Message templates | Pre-approve message templates in Twilio (required for outbound messages to non-opted-in users) |
| 4. Update credentials | Change `whatsapp_number` in tenant credentials from `+14155238886` (sandbox) to your real number |
| 5. Lead opt-in | Ensure leads have opted in to receive WhatsApp messages (legally required) |
| **Cost** | ~$0.005-$0.015 per message depending on country and template type |

### Resend email — what needs to change
| Step | What to do |
|---|---|
| 1. Domain setup | Add DNS records (SPF, DKIM, DMARC) for your sending domain in Resend dashboard |
| 2. From address | Use `noreply@yourdomain.com` instead of default |
| 3. Update `from_email` | Set `from_email` in tenant Resend credentials |
| **Cost** | Free up to 3,000 emails/month; $20/month for 50k |

---

## 6. Cross-Cutting

- [ ] Staging environment mirroring production
- [ ] Customer documentation / help center
- [ ] Pilot contract template with SLA disclaimer
- [ ] GDPR / IT Act data processing agreement template

---

*The system is working and demonstrable today. The items above are what separate "pilot-ready" from "sell confidently at scale."*
