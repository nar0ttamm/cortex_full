 # CortexFlow — Project status and “ready to sell” checklist

Use this file to track **what is done** and **what remains** across the monorepo: **CRM**, **backend**, **GCP VM**, and **cortex_voice** (voice-service). “Sell-ready” here means **reliably demonstrable**, **operationally owned**, and **commercially defensible** (support, SLAs, compliance)—not merely feature-complete in dev.

**Legend:** `[x]` done · `[ ]` not done / partial

---

## How far from a sellable production product?

**Honest snapshot:** The stack can already **demo** end-to-end lead → AI call → CRM update when the VM, FreeSWITCH, carrier, and env vars are correct. **Sellable SaaS** usually still needs: **hardening** (monitoring, backups, runbooks), **billing and onboarding**, **legal/compliance** (recording consent, data retention, DPA), **SLA-minded reliability** (retries, alerting, status page), and **product polish** (fewer rough edges in CRM and voice quality). Treat **Stage 4–5** in the old roadmap sense as the gap between “works in a pilot” and “we charge money with confidence.”

---

## 1. CRM (`crm/`)

### Done (representative)
- [x] Supabase auth, protected routes, dashboard, leads, pipeline, calls, communications, appointments, data import/export, integrations UI, tenant page
- [x] Dashboard analytics charts and activity; integrations connect/test flow; CRM UX iterations (master–detail comms, lead links, etc.)

### Remaining for sell-ready
- [ ] **Onboarding**: self-serve signup → tenant provisioning **or** clear manual provisioning doc for first paid customers
- [ ] **Observability**: client-side error reporting (e.g. Sentry), key funnel metrics
- [ ] **QA matrix**: cross-browser, mobile layouts, permission edge cases
- [ ] **Billing** (if productized): Stripe (or equivalent) + plan limits
- [ ] **Support**: in-app help link, status page, known-issue list
- [ ] **Security review**: RLS policies in Supabase, API abuse limits, secrets rotation story

---

## 2. Backend (`backend/`)

### Done (representative)
- [x] Express API on Vercel; `/v1` routes for leads, new calls, integrations, webhooks, appointments, credentials, email, etc.
- [x] Webhook ingestion + `leadNormalizer`; integration logs; proxy to voice service with timeout
- [x] Health check with DB

### Remaining for sell-ready
- [ ] **Rate limiting** and **idempotency** guarantees documented per public webhook
- [ ] **Cron / scheduling**: explicit production strategy (external cron + `CRON_SECRET`) for jobs that cannot rely on in-process node-cron on Vercel
- [ ] **Monitoring**: structured logs, error tracking, alerts on 5xx and slow queries
- [ ] **Load testing**: concurrent webhooks and `/calls/start` under realistic limits
- [ ] **Legacy vs new paths**: document which customers use Exotel/legacy vs `newCalls` only; deprecate dead code when safe

---

## 3. GCP VM (ops / infrastructure)

### Done (representative)
- [x] VM can run Docker FreeSWITCH + PM2 voice process; firewall allows TCP 5000 (and carrier ports as needed)

### Quick ops reference (dev session)
- Start VM in GCP Console → note **external IP** if it changed.
- SSH → `pm2 status` / `pm2 resurrect`; `curl http://localhost:5000/health` on the VM.
- `sudo docker ps` — FreeSWITCH container should run; start if needed per your image name.
- If IP changed: set Vercel **`VOICE_SERVICE_URL`** to `http://<IP>:5000` on **backend** project and redeploy.
- Firewall: **TCP 5000** (and SIP/RTP per carrier) must reach the VM.

### Remaining for sell-ready
- [ ] **Static egress or DNS**: reduce pain when public IP changes (reserved IP, or automation to update `VOICE_SERVICE_URL`)
- [ ] **Boot automation**: `pm2 save` / systemd so restarts are deterministic
- [ ] **Monitoring**: uptime checks on `/health`, disk, CPU, Docker/FS health
- [ ] **Backups**: anything stateful on VM (if any) + documented rebuild from repo
- [ ] **Security**: SSH keys only, fail2ban or equivalent, least-privilege service accounts

---

## 4. cortex_voice (`voice-service/`)

### Done (representative)
- [x] HTTP API: start-call, health, call lifecycle hooks; ESL + FreeSWITCH originate path (when configured)
- [x] Streaming STT/LLM/TTS pipeline (feature-flagged / evolved over time); DB writes for calls/transcripts; backend notify on completion

### Remaining for sell-ready
- [ ] **Conversation quality**: latency, barge-in, language/code-switch consistency; formal QA recordings
- [ ] **Telephony edge cases**: voicemail/AMD behavior, failed originate, carrier errors—user-visible outcomes in CRM
- [ ] **Capacity**: max concurrent calls per VM, scaling story (bigger VM vs pool)
- [ ] **Compliance**: recording off/on, consent prompts, retention—aligned with product legal stance
- [ ] **Runbook**: one page for “no audio”, “502 from backend”, “DB IPv6”, “ESL disconnect”

---

## 5. Cross-cutting (all sub-projects)

- [ ] **Single staging environment** that mirrors production (Supabase project, Vercel preview, VM staging)
- [ ] **Documentation for customers**: what CortexFlow does / does not do; integration setup PDF or help center
- [ ] **Pilot contract** template: scope, support hours, SLA disclaimer

---

## 6. Optional: landing (`landing/`)

- [ ] Align messaging with `PRODUCT.md`
- [ ] Lead capture wired to **`POST /v1/lead/ingest`** (or equivalent) with spam protection

---

*Last updated: 2026-04-19 — update this file when milestones change.*
