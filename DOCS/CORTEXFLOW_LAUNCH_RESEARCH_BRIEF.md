# CortexFlow — Launch research brief

**Purpose:** Paste this into ChatGPT (or any research model) to decide whether to fully launch, stay in private beta, or pause. This is **current product truth**, not a marketing doc.

**How to use:** Start the chat with: *“You are a market + GTM analyst for India B2B SaaS. Use ONLY this brief as the product source of truth. Do not invent features, customers, revenue, or live calling success. Flag what is unknown. Then answer the research questions at the end.”*

**Snapshot:**

- Code / conversion engine: implemented and pushed ~20 Sep 2026 (`main`).
- Ops / telco: last verified around that date. **Re-verify Telnyx, WhatsApp, and live dials before treating voice as commercially live.**
- This file: 22 Oct 2026.

**Do not assume:** Stripe billing, inbound phone numbers, GDPR export, SSO, LiveKit, FreeSWITCH, ML scoring, or that AI calls complete in production today.

---



## 1. What the product is

**Name:** CortexFlow  
**Category:** India-first **AI outbound calling + CRM** sold as a **lead-conversion system**, not a generic “AI CRM.”

**Job to be done:** A business receives a lead → CortexFlow contacts it quickly → qualifies on a call → extracts sales facts → scores temperature → books callback/site visit when possible → shows humans which leads to close → measures funnel (contacted / qualified / appointments / time-to-first-call).

**Intended buyer:** SMB / mid-market sales teams with inbound lead volume, especially **real estate** (current knowledge/product model is property: BHK, location, budget, possession). Architecture can pitch other verticals, but inventory (`kb_products`) and regex extractors are real-estate flavored today.

**Positioning (landing):** “AI calls every lead in under two minutes, qualifies, books the meeting, keeps WhatsApp / email / voice on one desk.”  
**Honesty check:** Architecture targets ~60s delay + up to 60s queue poll ≈ **under ~2 minutes to attempt**. **Live completed outbound calls were blocked by Telnyx (error D51: unverified / unpaid origination)** at last ops check. Email worked. WhatsApp needed Twilio sandbox.

**Repo:** `nar0ttamm/cortex_full` (monorepo). Live surfaces: `cortexflow.in` (landing), `crm.cortexflow.in` (CRM), Express API on Vercel, Pipecat voice on a GCP VM.

---



## 2. Technical status — what is BUILT vs LIVE



### 2.1 Built and in the product (software)


| Capability                        | Status                      | Notes                                                                          |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Multi-tenant workspace            | Built                       | Signup creates tenant; JWT + `user_profiles.tenant_id`                         |
| Teams / people / projects         | Built                       | Teams are **org UX**, not a security boundary                                  |
| Project knowledge (`kb_products`) | Built                       | AI pitch inventory per project                                                 |
| Lead ingest                       | Built                       | API, CSV, CRM manual add, webhooks, Meta path                                  |
| Project routing                   | Built                       | Explicit → default project → source map → single active → else block auto-call |
| Call queue                        | Built                       | Priorities, SKIP LOCKED, attempt caps                                          |
| Outbound AI call pipeline         | Built                       | Express → FastAPI/Pipecat → Telnyx Call Control → STT/LLM/TTS                  |
| Transcripts + call log            | Built                       | `calls`, `call_transcripts`                                                    |
| Post-call intelligence            | Built                       | `lead_context`: budget, location, requirement, objections, summary             |
| Deterministic lead score          | Built                       | 0–100; **null until a real conversation**; cold/warm/qualified/hot             |
| Human handoff UI                  | Built                       | Uses existing `assigned_to`; no new assignment system                          |
| Appointment from voice            | Built                       | Existing appointment + reminder jobs                                           |
| Callback parse                    | Built                       | “tomorrow 11am” / weekday; **does not invent time for “call later”**           |
| Conversion dashboard              | Built                       | Funnel, rates, time-to-first-call, source → qualified/appts, needs attention   |
| Estimated pipeline                | Built                       | Optional average deal value; labeled **estimate, not revenue**                 |
| Usage counters                    | Built                       | Calls, minutes, appointments, leads this month — **no Stripe**                 |
| Email notifications               | Built + was working in prod | Resend (or equivalent)                                                         |
| WhatsApp path                     | Built                       | **Not commercially live** without Twilio sandbox / sender                      |
| Focused conversion tests          | Built                       | Backend `npm test` (project resolve, score, callbacks, metrics)                |
| CRM production build              | Built                       | Next.js 15 App Router                                                          |




### 2.2 Not built / not launch-ready


| Gap                                    | Implication for launch                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Stripe / plan enforcement              | Cannot charge or cap usage in-product                                               |
| Live verified Telnyx origination       | **Cannot sell “AI will call your leads” until this works end-to-end**               |
| WhatsApp Business live sender          | Alerts/follow-up on WhatsApp incomplete                                             |
| Inbound PSTN / missed-call capture     | Outbound-only telco                                                                 |
| Team-scoped lead visibility            | All tenant users can see tenant leads (app-level lists)                             |
| Mature automated test suite            | Conversion logic tested; voice/e2e/load not                                         |
| Closed-won revenue                     | No real “revenue generated” metric                                                  |
| ML / RAG                               | Rule extract + project catalog only                                                 |
| SLA / multi-region / HA voice          | One e2-medium VM + PM2 poller; if VM dies, queue stops                              |
| Legal/compliance pack                  | No DND/consent workflow documented as a product feature                             |
| Customer success / onboarding at scale | Self-serve signup exists; default project must be configured when multiple listings |




### 2.3 Last known production scale (20 Sep 2026, **tiny**)

Approximate live DB: ~6 tenants, ~6 users, ~2 projects, ~17 leads, ~27 calls, **0 appointments**, ~118 communication rows. This is **internal/demo scale**, not a customer base.

Treat as: **software exists; commercial proof of conversion does not.**

---



## 3. Architecture (enough for market, not a code tour)

```
Landing (Next.js)
CRM (Next.js) ──JWT──► Express API (Vercel Hobby)
                         │
                         ├── Supabase Postgres + Auth
                         └── secret ──► FastAPI + Pipecat (GCP VM)
                                           │
                                      Telnyx Call Control
                                           │
                                      PSTN (India outbound intended)
                                           │
                                      Deepgram STT → OpenAI LLM → ElevenLabs TTS
                                           │
                                      POST /v1/calls/result
                                           │
                                      lead_context + score + CRM dashboard
```

**Critical infra facts:**

- Vercel Hobby crons are **daily**. Live queue is a **60s poller on the voice VM**, not Vercel minute-cron.
- API DB pool `max: 1` (serverless). Fine for low volume; not a scale story.
- Backend uses **service role** (bypasses RLS). Isolation is **application JWT +** `tenant_id` **on queries**.
- Voice is **stateful** (WebSocket media). Correctly **not** on Vercel.

**Voice stack:** Pipecat 0.0.108, Deepgram nova-3 (Hindi-capable config), GPT-4o-mini, ElevenLabs turbo. Caller ID last configured as a US Telnyx number (`+14355009976`) — **India brand/trust and D51 verification are product risks.**

---



## 4. Ability — what a paying customer could get **if voice is live**



### Can do

1. Capture leads (form, CSV, webhook, Meta if connected).
2. Attach lead to a **project** so AI sells the right inventory.
3. Auto-queue an outbound AI call (~60s after ingest when project is known).
4. Have the agent use that project’s products/knowledge on the call.
5. Persist transcript + concise sales summary.
6. Extract qualification fields when mentioned (not hallucinated).
7. Score 0–100 with explainable signals.
8. Flag **human follow-up** for hot/qualified leads and assign a salesperson.
9. Schedule appointment / callback when a **real datetime** is extracted.
10. Show funnel: leads → called → connected → qualified → appointments → confirmed.
11. Show **time to first call** (core sales argument: speed-to-lead).
12. Attribute by source (Meta vs Google vs CSV vs Unknown — only if source is stored).
13. Usage page for future billing (minutes, calls, appointments).



### Cannot honestly claim today

- “We generate revenue” (pipeline is estimated).
- “We called 1,000 leads in production” (volume is demo-scale; live dials were blocked).
- “AI replaces salespeople” (product explicitly hands hot leads to humans).
- “Omnichannel WhatsApp+voice live” (WhatsApp incomplete).
- “Enterprise security / SOC2 / DND-compliant out of the box.”
- “Works for any industry equally” (real-estate bias in extraction + KB).

---



## 5. Eligibility — can we launch, and under what conditions?

Think in **gates**, not a single yes/no.

### Gate A — Technical demo (almost yes)

Software loop exists: CRM, auth, ingest, queue, Pipecat, result, scoring UI.  
**Status:** Eligible for **closed demo / design-partner** if you can complete **one real phone conversation** on a funded, verified number.

### Gate B — “AI calls your leads” as a paid product (not yet)

Blocked until:

1. Telnyx (or another carrier) **successfully originates India outbound** repeatedly.
2. CLI / caller-ID acceptable to Indian prospects (US DID is a conversion killer).
3. Queue VM stays up or worker is moved off the voice box.
4. Tenant has a **default project** or only one listing (else ingest waits for assignment).



### Gate C — India telemarketing legality (research this; not implemented as product)

Unknown / not encoded in the app:

- TRAI / DND / National Do Not Call
- Consent on Meta/Google lead ads vs cold lists
- Recording consent
- Using AI voice vs “human-sounding” disclosure
- Data localization / DPDP Act (India personal data)
- Cross-border: US Telnyx number, GCP `asia-south1`, Vercel, OpenAI/Deepgram/ElevenLabs (likely US processing)

**Launch eligibility for India real estate:** probably **needs a lawyer + consent capture on ingest**, not just working Telnyx.

### Gate D — Monetization (not eligible)

No Stripe, no invoices, no usage limits. `tenants.plan` is a string. You can invoice manually / UPI / contract. Product cannot self-serve paid plans.

### Gate E — Support & reliability

Single VM, no on-call, no mature tests for the voice path, Hobby serverless. Eligible for **1–3 design partners**, not 50 concurrent customers.

---



## 6. Limitations (be blunt)



### Product

- Speed-to-lead **attempt** ≠ **connect**. No-answer/busy/voicemail still exist.
- Score is **rules**, not ML. Easy to explain, easy to game, not “AI intelligence.”
- Ambiguous projects **stop auto-calling** (correct for quality, bad for “set and forget” if client has 8 towers and no default).
- Historical leads were not backfilled with `project_id`.
- Teams do not hide leads from other teams.
- Next action WhatsApp/email still goes through Communications page, not a full sequencer.



### Technical / cost

- Per-minute cost stack: Telnyx + Deepgram + OpenAI Realtime-ish/LLM + ElevenLabs. Internal estimates on usage UI were **rough** (~$0.15/min AI + ~$0.028/min Telnyx India) — **not contracts**. Gross margin is a research question.
- Concurrency cap is small (backend ~3, Pipecat ~4 — can disagree).
- 2 attempts/lead/day — good for DND-ish behavior, bad for “keep calling until pickup” culture.
- Voice and queue share one VM: noisy neighbor + single point of failure.
- API on Hobby: cold starts, daily cron only.



### GTM

- No case study with **appointments booked** in live DB (0 appointments at last snapshot).
- Category is crowded: India lead-calling (Telecrm, myOperator, Knowlarity, Exotel, Airtel IQ) + global AI dialers (Bland, Vapi, Retell, Air AI) + CRM (Bitrix, LeadSquared, Sell.do for real estate).
- Differentiation claimed: **speed + project-aware pitch + qualification score + human handoff + funnel**, not “we have an LLM.”



### Honesty / trust

- If voice fails, dashboard still must not fabricate rates. Product tries to show “Not tracked.” Selling ahead of live dials would be a trust bomb.

---



## 7. Unit economics (inputs for research; not proven)

**Variable cost per connected minute (order of magnitude):**  
STT + LLM + TTS + PSTN. Internal UI used ~$0.18/min combined as a **guess**. India real-estate calls might be 2–5 minutes if they connect.

**Value side (buyer math):**  
If average deal is ₹50L–₹2Cr and one extra site visit / month pays for the tool, SMB real estate **can** pay ₹10k–₹50k/month — **only if** contact rate and appointment rate beat a human telecaller. That is the experiment, not a fact.

**Usage the product can bill later:** leads processed, AI call attempts, connected minutes, appointments, seats. Enforcement not built.

**Infra fixed-ish:** Vercel Hobby (or Pro), Supabase, 1× GCP e2-medium, Telnyx minimum balance, vendor API keys.

---



## 8. Competitive frame (for the research model to fill)

Ask the model to compare CortexFlow **as it actually is** against:

1. **Human calling team + Excel/Bitrix** — cheaper labor, worse speed-to-lead at night/weekends.
2. **India CPaaS (Exotel, Knowlarity, Airtel IQ)** — telephony + IVR, not project-aware sales AI.
3. **Real-estate CRMs (Sell.do, LeadSquared, PropFlo)** — CRM + some auto-dial; weaker live conversational AI.
4. **AI voice APIs (Vapi, Retell, Bland)** — you still need CRM, queue, scoring, India ops.
5. **WhatsApp-first (Interakt, Wati)** — not a phone qualifier.

CortexFlow’s **actual wedge:** own the **first 2 minutes after lead** + **project inventory on the call** + **sales brief for the closer**. Everything else is table stakes or incomplete.

---



## 9. Recommended launch shapes (options, not a decision)


| Option                                        | When it makes sense                      | Risk                           |
| --------------------------------------------- | ---------------------------------------- | ------------------------------ |
| **A. Pause GTM, fix telco**                   | If D51 still blocks dials                | Zero brand damage              |
| **B. Design partner (1–3 RE brokers)**        | After 10 consecutive live connects       | Need India CLI + consent       |
| **C. “CRM + queue + human click-to-call AI”** | Manual Start AI Call only                | Weaker speed-to-lead story     |
| **D. White-label voice for an existing CRM**  | If building CRM distribution is too hard | You become a feature           |
| **E. Full public launch + Stripe**            | Only after Gates B+C+D                   | High; product not eligible yet |


---



## 10. Research questions for ChatGPT

Answer with India 2025–2026 data where possible. Mark confidence. Do not invent CortexFlow metrics.

### Market

1. Size and growth of **India real-estate lead follow-up / auto-dial / AI calling** spend.
2. Typical SMB broker / builder **lead volume per month** and **cost of a human caller**.
3. Willingness to pay for **speed-to-lead under 2 minutes**.
4. Which cities / property types (primary residential vs resale vs plotted) convert on phone vs WhatsApp.



### Competition

1. Feature + price comparison vs Sell.do, LeadSquared, Telecrm, Exotel, Knowlarity, Vapi/Retell-based Indian agencies.
2. Where do they fail (night leads, project knowledge, no-shows, DND)?
3. Is “AI voice” already table stakes or still a differentiator in India RE?



### Regulation

1. TRAI DND + promotional voice + AI disclosure requirements.
2. DPDP Act impact if processing lead PII with US vendors.
3. Recording + storing call transcripts — consent needed?
4. Using a **US caller ID** to Indian mobiles — spam-label / pickup-rate impact.



### Economics

1. Realistic **pickup rate** for unknown CLI vs local +91 CLI.
2. Cost of **Indian DID / outbound** vs Telnyx from US number.
3. Gross margin if COGS is ~$0.10–$0.25 per connected minute.
4. Price points (₹/month vs ₹/connected minute vs ₹/qualified lead).



### GTM

1. Best first ICP: independent broker, small builder, education counseling, insurance, solar?
2. Should we launch **vertical (real estate only)** or horizontal?
3. Sales motion: self-serve vs founder-sold design partners.
4. What proof a buyer will demand (recordings, appointment rate, TTF C)?
5. Kill criteria: if we cannot get verified India origination in X weeks, stop?



### Go / no-go

1. Given this brief, is CortexFlow **a product** or **a prototype**?
2. Minimum viable launch checklist (ordered).
3. Should the founder spend next 90 days on **telco+compliance**, **design partners**, or **a different product**?
4. Honest probability that this becomes a ₹1Cr+ ARR business in 24 months vs a consulting/demo toy.

---



## 11. Suggested ChatGPT output format

Please return:

1. **Verdict:** Launch / Design-partner only / Pause / Pivot — one line.
2. **Why** (5 bullets, evidence-based).
3. **Must-fix before money** (ordered).
4. **ICP + offer** (one paragraph).
5. **Pricing hypothesis** (ranges, not fake precision).
6. **Competitive map** (table).
7. **Legal red flags** (India).
8. **90-day plan** vs **kill criteria**.
9. **Unknowns** that need a phone call to a telco/lawyer, not more software.

---



## 12. One-sentence truth

CortexFlow is a **working multi-tenant conversion CRM with a real voice architecture**, plus **scoring and funnel software**, sitting in front of a **telephony go-live and compliance gap**, with **no paid customers and no live appointment proof**. Research whether the **India speed-to-lead + project-aware AI call** wedge is worth closing that gap — not whether the dashboard looks like a SaaS.