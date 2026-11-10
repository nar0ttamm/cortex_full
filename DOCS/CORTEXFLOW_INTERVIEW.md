# CortexFlow — Architecture & Interview Pack

Shareable notes for resume / interviews. Matches the live product, not a pitch deck.

**One-liner:** Multi-tenant AI outbound calling CRM. Lead in → call in ~60s → qualify → score → callback/appointment → human closes.

**Resume line:** Built a production AI lead-conversion system (Next.js + Express + FastAPI/Pipecat) that auto-calls leads, extracts sales intelligence, scores them, and hands hot leads to humans — JWT tenant isolation, Telnyx voice, Supabase.

---

## 1. Runtime map

| Layer | What | Where |
|---|---|---|
| Landing | Next.js | `cortexflow.in` |
| CRM | Next.js 15 App Router | `crm.cortexflow.in` |
| API | Express on Vercel (`@vercel/node`, pool `max: 1`) | `cortex-backend-api.vercel.app` |
| Voice | FastAPI + Pipecat 0.0.108 | GCP VM + nginx TLS |
| DB / Auth | Supabase Postgres + Auth | API uses service role (bypasses RLS) |
| Telco | Telnyx Call Control | STT Deepgram / LLM OpenAI / TTS ElevenLabs |

**Not in prod:** LiveKit, FreeSWITCH, Stripe, inbound DID routing, team-scoped RLS.

---

## 2. Domain model

```
tenant (company)
  └── teams (org grouping, not a security boundary)
        └── people (user_profiles: admin | manager | executive)
  └── projects (what the AI sells)
        └── kb_products (pitch inventory)
        └── leads
              └── call_queue / calls / transcripts
              └── lead_context (intelligence + score)
              └── appointments / communications
```

**Tenant source of truth:** `user_profiles.tenant_id` — **not** JWT `user_metadata.tenant_id` (that mismatch caused 403s).

---

## 3. Happy path

```
Lead (ingest / CSV / webhook / Meta / CRM)
  → resolveProject (never guess)
  → INSERT leads + enqueue call_queue (~60s)
  → Pipecat poller GET /v1/internal/queue-worker
  → startOutboundCall
       INSERT calls (initiating) BEFORE dial   ← CRM stays truthful
       build call_brief (project KB + products)
       POST /voice/start-call (x-voice-secret)
  → Telnyx dial → WS media → Deepgram → OpenAI → ElevenLabs
  → POST /v1/calls/result (voice secret)
       transcript, status, appointment, persistConversion
  → score / summary / next_action / human_handoff
  → CRM lead workspace + conversion dashboard
```

Queue is **not** Vercel minute-cron (Hobby plan = daily). **Pipecat polls every 60s.** Common interview trap.

---

## 4. Auth (LLD)

```
Browser ──Supabase session cookie──► CRM Next.js /api/*
Browser ──Bearer access token──────► Express /v1  (requireUser)
Voice VM ──x-voice-secret──────────► /calls/result, /calls/tools
Poller  ──CRON_SECRET──────────────► /internal/queue-worker
Webhooks public path, HMAC/Bearer per integration
```

`requireUser`: validate JWT at Supabase `/auth/v1/user` → load `user_profiles` → if body/query `tenant_id` ≠ session tenant → **403**.

Signup: first user `tenant.id = user.id`. Invites share the admin’s tenant.

---

## 5. Outbound call (LLD)

`startOutboundCall.js`

1. Resolve project; **409** if ambiguous (no generic pitch).
2. Optimistic lock: `metadata.ai_call_status = In Progress` else 409.
3. `INSERT calls` first.
4. `callContextBuilder` + `selectProducts(project_id)` → `call_brief`.
5. 25s timeout to the voice VM.
6. Queue: `SELECT FOR UPDATE SKIP LOCKED`; priority demo=1, manual=2, ingest=5; max ~3 concurrent; 2 attempts/lead/day.

**During call:** agent tools `POST /v1/calls/tools/*` scoped to `project_id` (cannot search another tenant’s products).

**After call:** `/calls/result` is idempotent on `call_id` in `communications_log`. Calendar via existing `appointmentFromCall`. Conversion persist is **post-commit, best-effort** (don’t fail the telco webhook).

---

## 6. Project routing

```
explicit project_id (must belong to tenant)
  → tenants.settings.default_project_id
  → source_project_map[source]   // only if mapped, never guessed
  → exactly 1 active project
  → unresolved: needs_project_assignment, NO enqueue
```

Invalid UUID / another tenant’s project → **not remapped**.

---

## 7. Conversion engine (product, not ML)

| Piece | How |
|---|---|
| Intelligence | `lead_context` (budget, location, BHK, objections, summary) |
| Score | Deterministic 0–100; **null until a real conversation** |
| Temperature | 0–30 cold / 31–60 warm / 61–80 qualified / 81–100 hot |
| Handoff | score ≥ 61 or hot → `human_handoff`; reuse `assigned_to` |
| Next action | derived state machine, not a workflow engine |
| Callback | parse “tomorrow 11am” / Saturday; **“call later” = no time invented** |
| Funnel | leads → called → connected → qualified → appt → confirmed |
| Time to first call | `MIN(calls.started_at) − leads.created_at` |
| Pipeline | `avg_deal_value × qualified` — **estimate, never “revenue”** |
| Metrics | missing denominator → `null` / “Not tracked”, not fake 0% |

---

## 8. Whiteboard sequence

```
CRM ─JWT─► Express ─secret─► FastAPI
                              │
                         Telnyx CC API
                              │
                    PSTN ◄── media WS
                              │
                    Pipecat pipeline
                    Deepgram → OpenAI → ElevenLabs
                              │
                    POST /calls/result
                              │
                    Postgres (leads, calls, lead_context)
                              │
                    CRM polls /api/crm-data
```

30-second version:

```
Lead → [resolve project] → Queue → Voice VM (Pipecat + Telnyx)
                                      ↓
                              /calls/result
                                      ↓
                         lead_context + score
                                      ↓
                    CRM: next action / human / dashboard
```

---

## 9. Why these choices

| Decision | Why |
|---|---|
| Service role + JWT tenant check | Serverless API; RLS on for clients; API still must not mix tenants |
| Insert `calls` before dial | UI must not lie if Pipecat/Telnyx dies |
| Voice on GCP, API on Vercel | WebSockets + long media don’t fit serverless |
| Poller on VM, not Vercel cron | Hobby cron is daily; speed-to-lead is the product |
| Project required for AI | Wrong KB = wrong pitch = garbage conversion |
| Rule score, not ML | Explainable to sales; no hallucinated 87 |
| Teams ≠ RLS | Org UX now; security boundary later (easy to get wrong) |
| JSONB metadata + `lead_context` | Evolve without giant schema churn |
| Idempotent result webhook | Telnyx/Pipecat can retry |

---

## 10. Questions they will ask

**How do you isolate tenants?**  
JWT → `user_profiles.tenant_id`. Every query filters `tenant_id`. Cross-tenant `project_id` rejected. Voice tools require matching `project_id` + `tenant_id`.

**What if two projects exist?**  
Default project, or explicit, or source map. Else block auto-call.

**How do you not double-dial?**  
In-progress guard, `SKIP LOCKED`, attempt caps, result idempotency on `call_id`.

**Where does latency live?**  
Ingest delay 60s + poll 60s worst case ~2 min. Dial path: Vercel → GCP 25s timeout → Telnyx.

**Failure modes?**  
Telnyx D51 (unverified/unpaid number), `VOICE_SECRET` mismatch, FastAPI `detail` vs Express `error`, webhook duplicate, no project.

**How would you scale?**  
Queue + `SKIP LOCKED` scales on the worker. Vercel pool `max: 1` is a serverless constraint. Voice concurrency is the real cap (Telnyx + Pipecat bots). Next: more VMs or dedicated workers.

**Why not RAG?**  
`kb_products` per project is the catalog. Don’t invent a vector store until retrieval fails.

**Billing?**  
`tenant_usage` counters (calls, minutes, appointments). Readiness only — no Stripe.

**What’s not done?**  
Team-level visibility, live Telnyx origination, WhatsApp beyond Twilio sandbox, closed-won revenue, ML scoring.

---

## 11. Numbers you can say honestly

- Stack: Next.js 15, Express, FastAPI, Pipecat, Supabase, Telnyx
- Target: first AI call ~60s after ingest
- Score: 0–100 rules; hot ≥ 81
- Tests: conversion suite (project resolve, score, callback parse, time-to-first-call, no invented rates)
- Constraint: Hobby Vercel + one e2-medium voice VM

---

## 12. Commercial next step (if asked)

Telnyx number live → default project per tenant → sell **contact rate** and **time-to-first-call**, not “AI made N calls.”
