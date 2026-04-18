# CortexFlow — Voice AI product roadmap (Stages 0–5)

**Purpose:** Single source of truth for shipping **real-time AI phone conversations** integrated with the **CRM**, from **scope lock** through **pilot launch**.  
**How to use this file:** After each dev session or deploy, **tick** completed items (`[ ]` → `[x]`). Add a **short note** and **date** under “Progress log” at the bottom. Revisit **Stage 0** if scope changes so downstream stages stay honest.

**Related docs:** `DEVELOPMENT_STATE.md` (current stack), `GCP_SESSION_GUIDE.md` (VM / PM2 / FreeSWITCH), `CORTEXFLOW.md` (architecture).

---

## Progress snapshot (fill in as you go)

| Stage | Name | Status | Owner / notes |
|-------|------|--------|----------------|
| 0 | Scope lock | **Done** (2026-04-14) — see Stage 0 charter | Confirm on standup if wider team ACK needed |
| 1 | Real audio path | **In progress → largely working** (2026-04-18) — FreeSWITCH `mod_audio_fork` → Node WS → Deepgram STT → **OpenAI** (or Gemini) LLM → TTS → `uuid_broadcast`; metrics in `pm2 logs \| grep '\[metrics\]'` | Exit demo + limitation list still to formalize |
| 2 | CRM + lifecycle | **In progress** — `/v1/calls/start` + **`/v1/calls/result`** idempotent; lead metadata (`call_result`, transcript, **`appointment_requested`**); CRM lead detail shows scheduling hint | Manual QA matrix per outcome still open |
| 3 | Conversation quality | ☐ Not started · ☐ In progress · ☐ Done | Barge-in, endpointing, Hindi TTS path |
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
| **Allowed APIs** (e.g. OpenAI + Deepgram + ElevenLabs; or “TBD”) | **TBD shortlist**; must support **streaming**, **Indian English + Hindi/Hinglish**, and **low latency**. Existing deps in repo include Deepgram / Gemini stubs — final vendors chosen in Stage 1. |
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
- [ ] **Instrumentation:** log timestamps for **first STT partial**, **first LLM token**, **first TTS byte** per turn (even if rough).

### Checklist — connectivity

- [ ] Staging (or prod) VM can receive **live audio** from a test call on the chosen path.
- [ ] Process can **send audio back** to the same call leg and it is **audible** on handset.
- [ ] **Firewall / ports** documented for any new listeners (update `GCP_SESSION_GUIDE.md` if needed).

### Checklist — pipeline (minimal viable)

- [x] **Streaming STT** integrated (Deepgram live; WebSocket).
- [x] **LLM** receives history + system prompt; **streaming** + sentence chunking for TTS (OpenAI or Gemini).
- [x] **Chunked TTS** (WAV to shared dir + `uuid_broadcast`) — telephony 8 kHz PCM path.
- [x] **Session lifecycle:** ESL pipeline start/stop (`callMediaPipeline`); teardown on hangup.

### Checklist — observability

- [x] **call_id** in pipeline, ESL, and `[metrics]` lines (voice service).
- [ ] One **internal runbook** step: “how to place a test call and verify audio both ways.” (partially in `GCP_SESSION_GUIDE.md`)

### Stage 1 exit criteria

- [ ] **Demo recorded or witnessed:** stakeholder speaks on phone, hears **context-aware** AI reply (not pre-baked single clip only).
- [ ] **Known limitations** list started (e.g. “no barge-in yet”) — keep in this file or `DEVELOPMENT_STATE.md`.

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

### Checklist — lead / pipeline

- [x] Lead **status** updates from **interested** / **not_interested** / appointment-style outcomes (see `newCalls.js`).
- [ ] **Manual QA script:** create lead → call → verify CRM row **once** per outcome type.

### Stage 2 exit criteria

- [ ] **No duplicate** or **wrong-lead** updates on replay / retry of result webhook.
- [ ] Product sign-off on **minimum CRM fields** populated at end of call.

---

## Stage 3 — Conversation quality (“humanization” v1)

**Goal:** Calls feel **intentional**: short replies, sensible pauses, fewer cutoffs, optional barge-in if in Stage 0 scope.

### Checklist — prompts & flow

- [ ] System prompt enforces **short**, **spoken** sentences (no markdown, no bullet lists spoken aloud).
- [ ] **Opening greeting:** either generated or **cached audio** played immediately on answer to mask connect latency.
- [ ] **Silence / thinking** behavior: one scripted line (“Take your time”) if waiting for user — only if product wants it.

### Checklist — turn-taking

- [ ] **Endpointing** tuned for **Indian English** (and code-mix if in scope): test names, numbers, addresses.
- [ ] **False end-of-turn** issues logged and one tuning pass completed.
- [ ] If **barge-in** in v1: speaking during TTS **stops playback** and **listens**; no overlapping robot talk.

### Checklist — edge behaviors

- [ ] **Voicemail / long ring / busy** behavior matches Stage 0 decision.
- [ ] **Wrong number / opt-out** handling scripted and tested once.

### Checklist — quality bar

- [ ] **Dogfood set:** ≥10 calls to real Indian mobiles; spreadsheet or ticket with: transcript errors, latency feel, CRM correctness.
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
