# CortexFlow — Voice AI product roadmap (Stages 0–5)

**Purpose:** Single source of truth for shipping **real-time AI phone conversations** integrated with the **CRM**, from **scope lock** through **pilot launch**.  
**How to use this file:** After each dev session or deploy, **tick** completed items (`[ ]` → `[x]`). Add a **short note** and **date** under “Progress log” at the bottom. Revisit **Stage 0** if scope changes so downstream stages stay honest.

**Related docs:** `DEVELOPMENT_STATE.md` (current stack), `GCP_SESSION_GUIDE.md` (VM / PM2 / FreeSWITCH), `CORTEXFLOW.md` (architecture).

---

## Progress snapshot (fill in as you go)

| Stage | Name | Status | Owner / notes |
|-------|------|--------|----------------|
| 0 | Scope lock | **Done** (2026-04-14) — see Stage 0 charter | Confirm on standup if wider team ACK needed |
| 1 | Real audio path | **In progress → largely working** (2026-04-18) — FreeSWITCH `mod_audio_fork` → Node WS → Deepgram STT → **OpenAI** LLM → TTS → `uuid_broadcast`; metrics in `pm2 logs \| grep '\[metrics\]'` | **Known limitations** listed under Stage 1; stakeholder demo recording still TBD |
| 2 | CRM + lifecycle | **In progress** — same + **post-call slot → CRM calendar** when LLM returns **`proposed_appointment_iso`** (**IST** if no TZ in ISO) + `APPOINTMENT_ISO_PAST_GRACE_MS` | **Manual QA matrix** below; `/v1/calls/result` idempotent under row lock |
| 3 | Conversation quality | **In progress** — PCM barge-in + STT fragment merge + early hangup causes | Dogfood table in `voice-service/STAGE3_DOGFOOD.md`; Hindi TTS path still open |
| 4 | Hardening | ☐ Not started · ☐ In progress · ☐ Done | |
| 5 | Pilot → iterate | ☐ Not started · ☐ In progress · ☐ Done | |

---

## Stage 0 — Scope lock (definition of “v1 done”)

**Goal:** Everyone agrees what **finished** means for the first shippable voice product so engineering does not chase two media stacks or undefined “humanization” forever.

**Principles:**

- [x] **One v1 paragraph** exists (paste in team wiki or here under “Progress log”): who calls whom, what success looks like, what is explicitly **out of scope** for v1.
- [x] **v1 geography** documented (e.g. India-only; which GCP region for voice VM).
- [x] **v1 languages** documented (e.g. Indian English only; Hindi later = out of scope).
- [x] **Latency expectation** set as a **range** (e.g. “typical &lt; 1.5s after user stops” vs “sub-800ms”) so Stage 3 tuning has a target.
- [x] **Barge-in** for v1: **required** / **nice-to-have** / **v2** — decision recorded.
- [x] **Pilot audience** identified (internal only / friendly customers / production ICP).

### Checklist — use cases

- [x] Primary mode: **outbound** / **inbound** / **both** — chosen for v1.
- [x] Typical **call duration** band expected (e.g. 1–3 min qualification).
- [x] **Concurrency** target for v1 (e.g. max N simultaneous AI calls on one VM).

### Checklist — telephony & compliance (v1)

- [x] **Recording** policy: on/off; consent line if required.
- [x] **Voicemail / AMD** for v1: **in scope** / **out of scope** — decision recorded.
- [x] **Warm transfer to human** for v1: **in scope** / **out of scope** — decision recorded.
- [x] **PII / retention** for audio and transcripts: rough policy agreed (even if “no retention v1”).

### Checklist — commercial / vendor

- [x] **Budget band** per minute (STT + LLM + TTS + telephony) agreed or bracketed.
- [x] **Allowed third-party APIs** (STT/TTS/LLM) shortlist or “any cloud OK” documented.

### Stage 0 exit criteria (all must be ticked to leave Stage 0)

- [x] Written **v1 definition of done** approved by product + engineering.
- [x] **Explicit exclusions** for v1 listed (e.g. “no regional languages”, “no barge-in”) so they are not surprise-gated later.

### Stage 0 locked charter (fill this in during scope lock)

_Paste answers here, then tick the Stage 0 checkboxes above to match. One row = one decision._

| Decision | Our answer (v1) |
|----------|-----------------|
| **v1 one-paragraph** (who calls whom, success, out of scope) | **Outbound** from CortexFlow CRM: AI calls Indian leads to **qualify interest** (stored as a **probability / score**, see below) and **book a callback or schedule a meeting**. Success = correct CRM outcome + disposition. **Out of scope v1:** call recording, warm transfer to human, planned multi-call concurrency (see exclusions row). |
| **Geography** (e.g. India-only) + **GCP region** for voice VM (e.g. `asia-south1` Mumbai) | **India-only** end users. GCP: **confirm region in console** for the voice VM (often `asia-south1`); document in `GCP_SESSION_GUIDE.md` when confirmed. |
| **Languages** (e.g. Indian English only; Hindi = v2) | Default **Indian English**. **Code-switch:** if the user speaks **Hindi / Hinglish**, the agent follows in **Hinglish or Hindi** (STT multilingual + LLM reply language + Hindi-capable TTS). |
| **Latency target** (e.g. typical &lt; 1.5s after user stops) | **Normal** baseline (~**1.5s** after user stops) and **stretch tight** (~**1s**) where stack allows; Stage 3 tunes toward both. |
| **Barge-in** (required / nice-to-have / v2) | **Must-have** for v1. |
| **Pilot audience** (internal / friendly / ICP) | **Internal-first** until Stage 5; widen explicitly when chosen (TBD). |
| **Primary mode** (outbound / inbound / both) | **Outbound** (matches current CRM + `newCalls` / voice start-call). Inbound ICP = **post-v1** unless reprioritized. |
| **Typical call length** (e.g. 1–3 min) | **~2–5 min** typical (qualify + calendar slot + confirmations); shorter if disqualified early. |
| **Max concurrent AI calls** on one VM (N) | **Not fixed yet:** operate as **single-flight / low volume** until a capacity pass (Stage 4). **No concurrency planning number** required for Stage 0 exit; revisit before pilot scale. |
| **Recording** (on/off + consent if on) | **Off** for v1 (no call recording). |
| **Voicemail / AMD** (in scope / out of scope) | **In scope** for v1. |
| **Warm transfer** (in scope / out of scope) | **Out of scope** for v1. |
| **PII / audio retention** (e.g. no audio retention v1) | **No recorded calls.** Minimize retention: prefer **structured fields + short summary** in CRM over full transcripts; align exact DB columns in Stage 2. |
| **Budget band** per minute (rough INR or USD) | **TBD** — set after Stage 1 provider spike / metered test. |
| **Allowed APIs** (e.g. OpenAI + Deepgram + ElevenLabs; or “TBD”) | **TBD shortlist**; must support **streaming**, **Indian English + Hindi/Hinglish**, and **low latency**. Existing deps in repo include Deepgram + OpenAI — final vendors chosen in Stage 1. |
| **Explicit v1 exclusions** (bullet list) | No **call recording**. No **warm transfer**. **Concurrency / load targets** deferred. **Inbound IVR** not in v1 unless scope changes. **Regional Indian languages** (Tamil, Telugu, …) **not** committed unless separately scoped. |

### How v1 achieves “interest %” + callback / meeting (product ↔ engineering)

**Interest qualification (probability or score)**  
- **During / after the call**, the LLM (or a small post-call pass) emits **structured JSON**: e.g. rubric dimensions you care about (need fit, budget signal, timeline, decision-maker, objection level).  
- A **deterministic layer** maps those fields to a **single 0–100 score** or “probability band” (e.g. Cold / Warm / Hot) so CRM sorting stays consistent.  
- **Why not a raw “model %” only?** Raw logits are opaque; **rubric + capped score** is explainable for sales and reporting.  
- **Where it lands:** extend `calls` / `leads` (or `communications_log`) with fields like `qualification_score`, `qualification_band`, `qualification_reason` (short text). **Stage 2** implements writes + CRM UI.

**Callback or scheduled meeting**  
- **Tool-calling or a strict step flow:** when the user agrees, the agent calls a **calendar path** (your `appointments` / backend APIs) with **timezone + slot**, then **confirms aloud** (date/time repeat-back).  
- CRM shows **appointment** or **callback task** linked to `lead_id` + `call_id`. **Stage 2** wires idempotent writes + failure handling (slot taken, API error → spoken recovery).

**Hindi / Hinglish**  
- **STT:** multilingual / auto language or **primary EN + Hindi** mode so code-mix is captured.  
- **LLM:** system prompt: match user language (English ↔ Hinglish ↔ Hindi).  
- **TTS:** Hindi-capable voice or separate voice id when language flips.  
- **Stage 1–3** validate on real handsets (names, numbers, mixed sentences).

---

## Stage 1 — Real audio path (technical spine)

**Goal:** One **real** loop: **handset audio → your service → STT → LLM → TTS → handset audio**, on staging or production VM—not stubs or “simulate only” for the chosen path.

**Principles:**

- [x] Pick **exactly one** primary media path for v1 (do not parallelize two until one is green):
  - [ ] **Option A:** Carrier **media stream** (e.g. Telnyx WebSocket media) into `voice-service` (or sibling process).
  - [x] **Option B:** **FreeSWITCH** — `mod_audio_fork` WebSocket to `cortex_voice` audio ingress (see `GCP_SESSION_GUIDE.md`, `callMediaPipeline.ts`).
- [ ] All audio assumptions **telephony-realistic**: **8 kHz** narrowband unless you have proven wideband end-to-end.
- [x] **Instrumentation:** log timestamps for **first STT final**, **first LLM chunk**, **TTS synthesize ms** per turn (`[metrics]` in `callMediaPipeline` / `voiceCallMetrics`).

### Checklist — connectivity

- [ ] Staging (or prod) VM can receive **live audio** from a test call on the chosen path.
- [ ] Process can **send audio back** to the same call leg and it is **audible** on handset.
- [ ] **Firewall / ports** documented for any new listeners (update `GCP_SESSION_GUIDE.md` if needed).

### Checklist — pipeline (minimal viable)

- [x] **Streaming STT** integrated (Deepgram live; WebSocket).
- [x] **LLM** receives history + system prompt; **streaming** + sentence chunking for TTS (OpenAI).
- [x] **Chunked TTS** (WAV to shared dir + `uuid_broadcast`) — telephony 8 kHz PCM path.
- [x] **Session lifecycle:** ESL pipeline start/stop (`callMediaPipeline`); teardown on hangup.

### Checklist — observability

- [x] **call_id** in pipeline, ESL, and `[metrics]` lines (voice service).
- [ ] One **internal runbook** step: “how to place a test call and verify audio both ways.” (partially in `GCP_SESSION_GUIDE.md`)

### Stage 1 exit criteria

- [ ] **Demo recorded or witnessed:** stakeholder speaks on phone, hears **context-aware** AI reply (not pre-baked single clip only).
- [x] **Known limitations** list started — see **Known limitations (Stage 1 closure)** below (echo, endpointing, barge-in edges, PSTN quality, calendar ISO / clock skew).

### Known limitations (Stage 1 closure — living list)

These are **expected v1 edges**, not a bug list. Tune or harden in Stages 3–4.

- **PSTN / handset:** Narrowband audio, packet loss, room noise, and **acoustic echo** affect STT clarity and how natural TTS sounds on the callee’s phone.
- **Endpointing:** Deepgram silence detection may end a turn slightly early (mid-pause) or late on **Indian English / code-mix**; defaults are tuned via `DEEPGRAM_ENDPOINTING_MS` / `DEEPGRAM_UTTERANCE_END_MS` on the voice VM (see `voice-service/.env.example`).
- **Barge-in:** PCM energy during TTS playback triggers `uuid_break` + abort wait; **echo false triggers** can still occur — tune `VOICE_BARGE_IN_*`; overlapping-speech edge cases may remain on poor handsets.
- **First-word latency:** Time-to-first-TTS includes synthesis; a **shorter default greeting** and optional `VOICE_GREETING_TEMPLATE` reduce perceived connect delay.
- **Calendar slot ISO:** If `proposed_appointment_iso` has **no timezone**, the backend assumes **IST (`+05:30`)** so naive datetimes match CRM intent; **`APPOINTMENT_ISO_PAST_GRACE_MS`** on the backend absorbs small clock skew / webhook retries vs `not_future`.

---

## Stage 2 — CRM + lifecycle (product spine)

**Goal:** Every call is a **CRM object** with a **correct final state**—not a disconnected demo.

### Checklist — start call

- [x] CRM / **`POST /v1/calls/start`** returns `call_id` quickly; voice dials async.
- [x] **Idempotency** on **`/v1/calls/result`** (per `call_id` in `communications_log`).

### Checklist — during / end of call

- [x] **Outcome + transcript + summary** → lead metadata + `communications_log` entry.
- [x] **`/v1/calls/result`** handles outcomes including dial failure from voice notify; extend as new hangup reasons appear.
- [x] **Summary + structured `appointment_requested`** from LLM JSON → CRM metadata.
- [x] **Agreed slot** — `proposed_appointment_iso` (IST) from post-call JSON → **`applyVoiceScheduledAppointment`** → lead **`appointment_date` / `appointment_status: Scheduled`** (same as manual `/v1/appointment/schedule`; shows on CRM **Appointments**).

### Checklist — lead / pipeline

- [x] Lead **status** updates from **interested** / **not_interested** / appointment-style outcomes (see `newCalls.js`).
- [x] **Manual QA script (matrix):** run **once per row** on staging — create lead → trigger call → verify CRM / lead detail + `communications_log` + calendar when applicable.

| Step | Outcome / condition | Lead status | `communications_log` | Calendar (`proposed_appointment_iso`) | Notes |
|------|---------------------|------------|----------------------|---------------------------------------|--------|
| 1 | `interested` | `interested` | New row, `call_id` set | If valid future ISO + IST parsing → **Scheduled** | |
| 2 | `not_interested` | `not_interested` | Row appended | No change unless ISO also sent | |
| 3 | `appointment_booked` | `interested` | Row + flags | Should apply when ISO present | |
| 4 | `dial_failed` / `no_answer` / `technical_failure` | prior or N/A | Row, `ai_call_status` Failed | N/A | |
| 5 | **Replay same `call_id`** | unchanged | **Duplicate** response; no second log row | No double-apply | `POST /v1/calls/result` idempotent |

### Stage 2 exit criteria

- [x] **No duplicate** or **wrong-lead** updates on replay / retry of result webhook (same DB transaction + `SELECT … FOR UPDATE` + `call_id` in `communications_log`).
- [ ] Product sign-off on **minimum CRM fields** populated at end of call.

---

## Stage 3 — Conversation quality (“humanization” v1)

**Goal:** Calls feel **intentional**: short replies, sensible pauses, fewer cutoffs, optional barge-in if in Stage 0 scope.

### Checklist — prompts & flow

- [x] System prompt enforces **short**, **spoken** sentences (no markdown); scheduling copy points to CRM calendar.
- [x] **Opening greeting:** shorter **default text** + `VOICE_GREETING_TEMPLATE` on VM; **cached audio** still optional for future latency wins.
- [ ] **Silence / thinking** behavior: one scripted line (“Take your time”) if waiting for user — only if product wants it.

### Checklist — turn-taking

- [x] **Endpointing** defaults adjusted for **Indian English** (`DEEPGRAM_*` env; defaults in `speechRecognition.ts`); names/numbers still need dogfood passes.
- [x] **False end-of-turn:** short finals without sentence end are **held** and merged with the next final (`VOICE_STT_MERGE_*`); `[metrics] stt_false_eot_merged` + log `STT merged … finals`.
- [x] **Barge-in:** during TTS **playback**, forked PCM is scanned for **energy** (`pcmBargeIn.ts`); sustained level → `uuid_break` + generation bump + abort playback wait (`VOICE_BARGE_IN_*`).

### Checklist — edge behaviors

- [x] **Voicemail / long ring / busy (pre-answer):** `CHANNEL_HANGUP_COMPLETE` → `Hangup-Cause` mapped in `sipHangupCause.ts` → `early_hangup` event + `POST /v1/calls/result` with `no_answer` / `user_busy` / `voicemail_or_machine` / `dial_failed`.
- [ ] **Wrong number / opt-out** handling scripted and tested once.

### Checklist — quality bar

- [x] **Dogfood template:** `voice-service/STAGE3_DOGFOOD.md` (≥10 rows + grep hints).
- [ ] **Top 3 issues** from dogfood have owners and **done** or **won’t fix v1** labels.

### Stage 3 exit criteria

- [ ] Product accepts **v1 conversation bar**; remaining issues are **Stage 4/5** backlog items, not hidden surprises.

---

## Stage 4 — Hardening (reliability under light load)

**Goal:** Safe to run **small concurrent** traffic without manual babysitting.

### Checklist — capacity & limits

- [ ] **N concurrent calls** tested (N = Stage 0 target); CPU/memory noted; **cap** or queue behavior defined.
- [ ] **Provider rate limits** documented; backoff / error messages do not wedge FS or orphan legs.

### Checklist — resilience

- [ ] **Timeouts** on external APIs (STT/LLM/TTS); failure → **graceful hangup or message** + CRM **failed** path.
- [ ] **Restart test:** PM2 restart mid-call (or kill -9) behavior documented; acceptable loss stated.

### Checklist — security & ops

- [ ] Secrets not in repo; rotation story **one line** minimum.
- [ ] **Alerts** or daily log review for error rate on voice VM (even if manual v1).

### Checklist — documentation

- [ ] `DEVELOPMENT_STATE.md` (or this file) reflects **actual** Stage 1 media choice and ports.
- [ ] **On-call / who to ping** for voice VM incidents.

### Stage 4 exit criteria

- [ ] **Go/no-go** for pilot: engineering + product both tick **ready**.

---

## Stage 5 — Pilot → iterate (launch v1, then improve)

**Goal:** **Real** usage at **controlled** volume; learn with numbers; **finish** v1 in the business sense (shipped + measured).

### Checklist — pilot setup

- [ ] **Pilot window** (dates, hours, max calls/day).
- [ ] **Success metrics** defined: e.g. answer rate, avg duration, booking/callback rate, cost/minute, CRM accuracy %.
- [ ] **Rollback:** how to disable AI dial or throttle (feature flag / env / manual).

### Checklist — feedback loop

- [ ] Weekly (or daily during pilot) **review** of metrics + top failures.
- [ ] **Backlog** ordered only by pilot impact (latency vs STT vs CRM vs prompt).

### Checklist — post–v1 (optional backlog pointer)

- [ ] **Stage 6+** ideas captured elsewhere: second language, E2E speech API spike, advanced turn model, warm transfer, multi-region.

### Stage 5 exit criteria

- [ ] **v1 declared launched** (even if small); retrospective **3 bullets** what to keep vs change.

---

## Progress log (append after meaningful work)

_Use one line per session or deploy: date, stage touched, what was ticked, link to PR/commit if useful._

| Date | Stage | Summary |
|------|-------|---------|
| 2026-04-14 | 0 | Locked: outbound qualify (score) + callback/meeting; EN→HI/Hinglish; latency normal+tight; barge-in must; no recording; AMD in; no warm transfer; concurrency TBD; charter + “how % works” in doc. |
| 2026-04-18 | 1–2 | OpenAI LLM on GCP VM (`LLM_PROVIDER=openai`); `/health` exposes `llm_provider` + `llm_model`; **`appointment_requested`** wired voice → backend → lead metadata → CRM lead detail hint; roadmap snapshot updated. |
| 2026-04-19 | 2–3 | Post-call JSON **`proposed_appointment_iso`** → backend **`applyVoiceScheduledAppointment`** (CRM calendar fields); shorter default greeting + tunable **Deepgram endpointing**; prompt tuned for IST slot extraction. |
| 2026-04-19 | 1 | TTS diagnostics: **`TTS_PROVIDER` must be `elevenlabs`** to use ElevenLabs voice; `/health` exposes TTS + warnings; ElevenLabs natural preset + lower streaming latency default; Stage 1 **metrics** for STT→LLM→TTS. |
| 2026-04-14 | 1–4 | **Calendar:** naive ISO → **IST** + `APPOINTMENT_ISO_PAST_GRACE_MS`; **`/v1/calls/result`** transactional idempotency; ingress **one-time** open-secret warning; roadmap **limitations** + **QA matrix**; **Deepgram** defaults 300/1050 ms; shorter default greeting. |
| 2026-04-14 | 3 | **Barge-in** (PCM RMS during playback), **STT fragment merge** (false EOT), **early hangup** → CRM (`sipHangupCause.ts`); dogfood template `voice-service/STAGE3_DOGFOOD.md`; backend outcomes `user_busy` / `voicemail_or_machine`. |
| | | |

---

## Quick reference — do not parallelize until green

| Until this is true… | Do not start… |
|---------------------|----------------|
| Stage 0 complete | Heavy Stage 3 tuning (no target) |
| One media path working (Stage 1) | Second media path “just in case” |
| Stage 2 CRM correct | Large external pilot |
| Stage 4 checklist mostly green | Unbounded production marketing dial |

---

*Last template update: roadmap structure for Stages 0–5. Update the progress log when you tick major exit criteria.*
