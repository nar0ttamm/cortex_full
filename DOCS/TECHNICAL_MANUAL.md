# CortexFlow — Internal Technical Manual

> For the engineering and operations team. Covers how all services connect, what each file does, and how to debug common issues.

---

## System Map

```
┌──────────────────────────────────────────────────────────────────┐
│  INTERNET                                                        │
│                                                                  │
│  Lead sources → POST /v1/lead/ingest                            │
│  CRM browser  → Next.js on Vercel (crm.cortexflow.in)           │
│  CRM browser  → POST /v1/calls/start (Vercel backend)           │
└────────────────────┬─────────────────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼─────────────────────────────────────────────┐
│  VERCEL — cortex-backend-api.vercel.app                          │
│  backend/server.js (Express serverless)                          │
│                                                                  │
│  /v1/lead/ingest      → create lead → notify → schedule          │
│  /v1/calls/start      → proxy to VM:5000/voice/start-call        │
│  /v1/calls/result     → update lead + fire post-call notifs      │
│  /v1/notifications/send → manual notify trigger                  │
│  /v1/internal/*       → cron jobs (call scheduler + reminders)   │
│  /v1/integrations/*   → webhook ingestion from ad platforms      │
│                                                                  │
│  Services:  notificationService.js (Twilio WhatsApp + Resend)    │
│             appointmentFromCall.js  (ISO date → Supabase)        │
│             credentialService.js   (encrypted keys per tenant)   │
└────────────────────┬─────────────────────────────────────────────┘
                     │ HTTP (VOICE_SERVICE_URL = http://<VM_IP>:5000)
┌────────────────────▼─────────────────────────────────────────────┐
│  GCP VM  — port 5000 public                                      │
│                                                                  │
│  PM2 process: cortex_voice (voice-service/src/index.ts)          │
│  │                                                               │
│  ├─ POST /voice/start-call                                        │
│  │    Creates LiveKit room → dispatches Python agent              │
│  │    Instructs LiveKit SIP to dial lead phone via Telnyx         │
│  │                                                               │
│  └─ POST /voice/call-result   (called by Python agent)           │
│       Saves to Supabase (calls + call_transcripts tables)        │
│       Notifies Vercel backend /v1/calls/result                   │
│                                                                  │
│  PM2 process: cortex-livekit  (LiveKit Server binary)            │
│  PM2 process: cortex-sip      (Docker: livekit/sip → Telnyx)    │
│  PM2 process: cortex-agent    (Python: voice-service/agent/)     │
└──────────────────────────────────────────────────────────────────┘
                     │ LiveKit WebRTC + SIP
┌────────────────────▼─────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                               │
│  Telnyx         — SIP trunk (PSTN calls)                        │
│  OpenAI         — Realtime API (gpt-4o-realtime-preview)        │
│  Deepgram       — STT + TTS (Groq mode)                         │
│  Groq           — LLM (llama-3.3-70b-versatile, Groq mode)      │
│  Supabase       — Postgres + Auth                               │
│  Twilio         — WhatsApp API (sandbox currently)              │
│  Resend         — Transactional email                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
AI calling and CRM/
├── crm/                    Next.js 15 CRM frontend (Vercel)
│   ├── app/                Pages + API routes
│   │   ├── page.tsx        Dashboard
│   │   ├── leads/          Lead list + detail
│   │   ├── calls/          Call history
│   │   ├── appointments/   Calendar
│   │   ├── communications/ Per-lead message thread
│   │   ├── api/            Next.js API routes (proxy to backend)
│   │   │   ├── crm-data/   Reads leads from Supabase
│   │   │   ├── stats/      Dashboard stats
│   │   │   ├── leads/[leadId]/notify/  Manual notification trigger
│   │   │   └── leads/[leadId]/notes/   Notes CRUD
│   │   ├── hooks/          useLeadNotifications (toast system)
│   │   └── components/     AppShell, NotificationToast, etc.
│   └── lib/                callsApi.ts, callStatusUi.ts, auth.ts
│
├── backend/                Express API on Vercel
│   ├── server.js           App entry; route registration
│   ├── config/index.js     All env var access
│   ├── db.js               Postgres pool (Supabase)
│   ├── routes/
│   │   ├── leads.js        /v1/lead/ingest, CRUD
│   │   ├── newCalls.js     /v1/calls/start, /v1/calls/result, list
│   │   ├── notifications.js /v1/notifications/send (manual)
│   │   ├── internal.js     Cron job triggers
│   │   ├── integrations.js Webhook ingestion
│   │   ├── appointments.js Manual appointment scheduling
│   │   ├── credentials.js  Per-tenant API key management
│   │   └── email.js        Resend inbound webhook
│   ├── services/
│   │   ├── notificationService.js  WhatsApp + Email senders
│   │   ├── appointmentFromCall.js  ISO date → Supabase update
│   │   ├── credentialService.js    Encrypted key store
│   │   ├── leadService.js          Lead CRUD helpers
│   │   └── aiService.js            GPT transcript analysis
│   └── jobs/
│       ├── callScheduler.js   Fires pending calls from queue
│       └── reminderJob.js     24h + 3h appointment reminders
│
├── voice-service/          GCP VM voice stack
│   ├── src/
│   │   ├── index.ts           Express on port 5000 (public entry)
│   │   ├── callController.ts  /voice/start-call + /voice/call-result
│   │   ├── livekitBridge.ts   JWT generation + LiveKit API calls
│   │   ├── callStorage.ts     Supabase read/write for calls
│   │   └── backendNotify.ts   Posts results to Vercel backend
│   └── agent/
│       ├── main.py            Python LiveKit AI Agent
│       └── .env               Agent environment variables
│
└── DOCS/                   This folder
```

---

## Key Files Deep-Dive

### `voice-service/agent/main.py`
The AI agent. Key sections:
- `build_instructions()` — system prompt with greeting, language rules, Hindi/Hinglish behaviour
- `_make_session()` — builds `AgentSession` (realtime or groq mode)
- `CortexFlowAgent.on_enter()` — plays greeting when call connects
- `book_appointment()` — function tool; stores ISO date, sets `_outcome`
- `end_call()` — function tool; speaks farewell, waits 4s, sets `_done` event
- `_hang_up_sip()` — calls LiveKit RoomService.RemoveParticipant to kill SIP leg
- `entrypoint()` — wires everything together; waits for `_done` or SIP disconnect

### `voice-service/src/callController.ts`
- `startCall()` — validates secret, creates call row, calls `livekitBridge.startLivekitCall()`
- `callResult()` — receives agent's POST, saves to Supabase via `callStorage`, notifies Vercel backend

### `voice-service/src/livekitBridge.ts`
- `makeLivekitToken()` — generates JWT with correct grants (RoomService + AgentDispatch + SIP)
- `startLivekitCall()` — creates LiveKit room → dispatches agent → creates SIP participant

### `backend/services/notificationService.js`
- `sendLeadEntryNotifications()` — fires 4x on new lead
- `sendAppointmentBookedNotifications()` — WhatsApp + Email to admin + lead, after appointment booked
- `sendCallbackNotifications()` — WhatsApp only to admin + lead, after callback outcome
- `sendAppointmentReminder()` — WhatsApp to lead, 24h/3h before appointment
- `logCommunications()` — appends entries to `lead.metadata.communications_log`

### `backend/routes/newCalls.js`
- `POST /v1/calls/start` — proxies to VM voice service with 25s timeout
- `POST /v1/calls/result` — transactional update (FOR UPDATE lock) + idempotency via `call_id` in log; triggers post-call notifications after COMMIT
- `GET  /v1/calls/:tenantId` — joins `calls`, `leads`, `call_transcripts` for CRM display

---

## Supabase Schema (key tables)

| Table | Key columns | Notes |
|---|---|---|
| `tenants` | `id`, `name`, `settings` (jsonb) | One row per client workspace |
| `leads` | `id`, `tenant_id`, `name`, `phone`, `email`, `status`, `metadata` (jsonb) | `metadata` holds call results, appointments, communications_log |
| `calls` | `id`, `tenant_id`, `lead_id`, `status`, `outcome`, `duration_seconds` | Source of truth for call state (polled by CRM) |
| `call_transcripts` | `call_id`, `summary`, `full_transcript` | Joined into calls query |
| `call_events` | `call_id`, `event_type`, `payload` | Timeline events per call |

### Lead `metadata` shape (jsonb)
```json
{
  "ai_call_status": "Completed",
  "call_result": "appointment_booked",
  "call_transcript": "...",
  "appointment_status": "Scheduled",
  "appointment_date": "2026-04-21T19:00:00+05:30",
  "ai_call_status": "called",
  "communications_log": [
    { "type": "whatsapp", "direction": "to_admin", "status": "fulfilled", "timestamp": "..." }
  ],
  "reminder_1day_sent": false,
  "reminder_3hr_sent": false
}
```

---

## Common Debug Scenarios

### "Call shows initiating but never connects"
1. SSH to VM → `pm2 logs cortex_voice --lines 50`
2. Check if `VOICE_SERVICE_URL` in Vercel matches current VM IP
3. Check `pm2 logs cortex-agent` — agent might not be registered
4. Verify LiveKit server: `curl http://localhost:7880/rtc/validate` should return 200

### "Agent connects but is silent"
1. `pm2 logs cortex-agent` — look for `on_enter` logs
2. Check `OPENAI_API_KEY` is set in `/opt/cortex/agent/.env`
3. Realtime mode: verify `AGENT_MODE=realtime` in `.env`

### "Appointment not showing in CRM calendar"
1. Check Supabase `leads` table: does `metadata.appointment_status = 'Scheduled'`?
2. Check `metadata.appointment_date` — must be valid ISO 8601
3. `pm2 logs cortex-agent` — look for `[tool:book_appointment]` log line
4. `pm2 logs cortex_voice` — look for `POST /voice/call-result` response
5. Backend logs on Vercel — look for `/v1/calls/result` response with `calendar.applied`

### "WhatsApp notification not sent"
1. Verify Twilio credentials in tenant's integration settings
2. Check sandbox: lead's phone must be registered in Twilio sandbox
3. `pm2 logs cortex_voice` or Vercel function logs for notification errors

### "SIP call not hanging up after conversation ends"
1. Check `pm2 logs cortex-agent` for `[tool:end_call]` and `[_hang_up_sip]` logs
2. Verify `LK_HTTP_URL`, `LK_KEY`, `LK_SECRET` in agent `.env`
3. SIP participant identity format: `sip-{call_id}` (no `call-` prefix)

---

## VM Operations Cheatsheet

```bash
# Check all services
bash ~/cortexflow-status.sh

# PM2 commands
pm2 list                        # See all services and status
pm2 logs cortex-agent --lines 50  # Live agent logs
pm2 logs cortex_voice --lines 50  # Voice service logs
pm2 restart cortex-agent         # Restart agent after code changes

# Deploy updated agent code (from local machine)
scp -i ~/.ssh/gcp_cursor_key voice-service/agent/main.py \
    cortexflowagent@<VM_IP>:/opt/cortex/agent/main.py
ssh -i ~/.ssh/gcp_cursor_key cortexflowagent@<VM_IP> "pm2 restart cortex-agent"

# Deploy updated cortex_voice (after TypeScript changes)
# On VM:
cd /opt/cortex/voice-service && npm run build && pm2 restart cortex_voice

# Check Docker containers
docker ps
docker logs cortex-sip-container --tail 30

# Test voice service health
curl http://localhost:5000/health
```

---

## Deploying CRM Changes

1. Make changes in `crm/`
2. Build test: `cd crm && npm run build`
3. Deploy: `cd crm && npx vercel deploy --prod --yes`
4. Or push to GitHub — but Vercel is configured for CLI deploy, so the npx command is more reliable

## Deploying Backend Changes

1. Make changes in `backend/`
2. Push to GitHub (Vercel auto-deploys backend from `backend/` subfolder per `vercel.json`)
3. Or: `cd backend && npx vercel deploy --prod --yes`

---

*Keep this document updated whenever architecture changes. The source of truth is always the actual code + the VM's running state.*
