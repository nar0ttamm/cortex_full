# CortexFlow — Monthly Cost Forecast

> Last updated: April 2026
> Exchange rate used: **$1 = ₹84** (April 2026 approximate)
> Scope: 24/7 VM with static IP. Twilio (WhatsApp) and Deepgram excluded — currently free/sandbox. Resend email is on verified domain (free tier, 3k emails/month — excluded below as effectively free at pilot scale).

---

## Summary Table

| Service | What for | Monthly cost (USD) | Monthly cost (INR) |
|---|---|---|---|
| GCP VM (e2-medium, asia-south1) | All voice services | ~$18–20 | ~₹1,512–1,680 |
| GCP Static IP | Fixed public IP | ~$3 | ~₹252 |
| GCP Boot Disk (30 GB SSD) | OS + code + logs | ~$5 | ~₹420 |
| **GCP Total** | | **~$26–28/month** | **~₹2,184–2,352/month** |
| OpenAI Realtime API | AI voice conversations | $8–345 (usage-based) | ₹672–28,980 |
| Telnyx | PSTN call minutes | $1–17 (usage-based) | ₹84–1,428 |
| Vercel | CRM + Backend hosting | $0 (free tier) | ₹0 |
| Supabase | Database + Auth | $0 (free tier) | ₹0 |
| **TOTAL** | | **~$35–390/month** | **~₹2,940–32,760/month** |

Range is wide because OpenAI and Telnyx are pure pay-per-use. See breakdowns below.

---

## 1. Google Cloud Platform VM

**Machine:** `e2-medium` — 2 vCPU (burstable), 4 GB RAM
**Region:** `asia-south1-c` (Mumbai)
**Uptime:** 24/7 (730 hours/month)

### Compute

| Item | Rate (USD) | Rate (INR) | Monthly (USD) | Monthly (INR) |
|---|---|---|---|---|
| e2-medium on-demand | ~$0.0352/hr | ~₹2.96/hr | ~$25.70 | ~₹2,159 |
| GCP sustained use discount (auto, ~30% for 100% usage) | −30% | −30% | −$7.71 | −₹648 |
| **Effective compute cost** | | | **~$18.00** | **~₹1,512** |

> GCP automatically applies sustained use discounts when a VM runs for the full month — no action needed.

### Storage

| Item | Size | Rate (USD) | Rate (INR) | Monthly (USD) | Monthly (INR) |
|---|---|---|---|---|---|
| SSD persistent boot disk | 30 GB | $0.170/GB | ₹14.28/GB | ~$5.10 | ~₹428 |
| (Alternative: standard disk) | 30 GB | $0.040/GB | ₹3.36/GB | ~$1.20 | ~₹101 |

> Recommendation: use SSD for better I/O on the voice service. ₹428/month is worth it.

### Static IP

| Item | Rate (USD) | Rate (INR) | Monthly (USD) | Monthly (INR) |
|---|---|---|---|---|
| Reserved regional external IP (attached to running VM) | $0.004/hr | ₹0.34/hr | ~$2.92 | ~₹245 |

> GCP now charges ~$0.004/hr for standard tier external IPs. Budget ~$3 (₹252)/month to be safe.

### GCP Total (24/7, static IP, SSD)

| | USD | INR |
|---|---|---|
| Compute (with sustained discount) | ~$18.00 | ~₹1,512 |
| SSD boot disk (30 GB) | ~$5.10 | ~₹428 |
| Static IP | ~$2.92 | ~₹245 |
| **Monthly GCP total** | **~$26–$28** | **~₹2,184–₹2,352** |

---

## 2. OpenAI Realtime API

**Model:** `gpt-4o-realtime-preview`
**Mode:** Audio-in / Audio-out (WebSocket, full duplex)

### Pricing (current)

| Token type | Rate (USD) | Rate (INR) |
|---|---|---|
| Audio input | $100.00 / 1M tokens | ₹8,400 / 1M tokens |
| Audio output | $200.00 / 1M tokens | ₹16,800 / 1M tokens |
| Text input (system prompt, function calls) | $5.00 / 1M tokens | ₹420 / 1M tokens |
| Text output | $20.00 / 1M tokens | ₹1,680 / 1M tokens |

**Audio token estimate:** ~1,500 tokens per minute of speech (OpenAI approximation)

### Per-minute cost breakdown

| Component | Per minute (USD) | Per minute (INR) | Notes |
|---|---|---|---|
| Audio input (lead speaking) | ~$0.075 | ~₹6.30 | ~1,500 tokens/min × $100/1M |
| Audio output (agent speaking) | ~$0.150 | ~₹12.60 | ~1,500 tokens/min × $200/1M |
| Text (prompt + tools, amortised) | ~$0.005 | ~₹0.42 | System prompt charged once per call; function calls ~100 tokens each |
| Telnyx PSTN (India outbound) | ~$0.011 | ~₹0.92 | Per-minute SIP trunk charge |
| **Total per minute of live call** | **~$0.24** | **~₹20** | OpenAI + Telnyx combined |

> Rule of thumb: **every minute of an AI call (OpenAI mode) costs ~$0.24 (~₹20)**.
> In Groq mode this drops to **~$0.011/min (~₹0.92/min)** — Telnyx only, since Groq + Deepgram are free tier.

---

### Per-call cost estimate

| | 2-min call | 3-min call | 5-min call |
|---|---|---|---|
| Audio in (lead speaking) | $0.15 (₹12.60) | $0.23 (₹19.32) | $0.38 (₹31.92) |
| Audio out (agent speaking) | $0.30 (₹25.20) | $0.45 (₹37.80) | $0.75 (₹63.00) |
| Text (prompt + function tools) | ~$0.01 (₹0.84) | ~$0.01 (₹0.84) | ~$0.02 (₹1.68) |
| **Per-call total** | **~$0.46 (~₹39)** | **~$0.69 (~₹58)** | **~$1.15 (~₹97)** |

> Average call in practice: 2–3 minutes for a qualifying conversation.

### Monthly forecast by volume

| Calls/month | Avg duration | Monthly OpenAI cost (USD) | Monthly OpenAI cost (INR) |
|---|---|---|---|
| 50 | 2 min | ~$23 | ~₹1,932 |
| 100 | 2 min | ~$46 | ~₹3,864 |
| 200 | 2.5 min | ~$138 | ~₹11,592 |
| 500 | 2.5 min | ~$345 | ~₹28,980 |
| 50 | 3 min | ~$35 | ~₹2,940 |
| 100 | 3 min | ~$69 | ~₹5,796 |
| 200 | 3 min | ~$138 | ~₹11,592 |

> **For a typical pilot (50–100 calls/month):** expect $23–70/month (~₹1,932–5,880) in OpenAI costs.
>
> **Cost reduction option:** Switch `AGENT_MODE=groq` in the agent `.env`. Groq LLM is currently free (generous free tier), Deepgram is also free tier — this drops the LLM/STT/TTS cost to ~$0 at current volume while maintaining good quality.

---

## 3. Telnyx (SIP / PSTN Calls)

**Usage:** Outbound SIP calls via Telnyx SIP trunk to lead phone numbers.

### Pricing

| Destination | Per-minute rate (USD) | Per-minute rate (INR) |
|---|---|---|
| India mobile (local) | ~$0.011/min | ~₹0.92/min |
| India landline | ~$0.008/min | ~₹0.67/min |
| US mobile/landline | ~$0.006/min | ~₹0.50/min |
| UK mobile | ~$0.012/min | ~₹1.01/min |

**Additional:**
- SIP trunk: pay-as-you-go (no monthly fee)
- Phone number (DID): ~$1.00–2.00/month (~₹84–168) per number (optional, for caller ID)
- Inbound calls: ~$0.004/min (~₹0.34/min) (if you add inbound support later)

### Monthly forecast by volume

| Calls/month | Avg duration | Destination | Monthly cost (USD) | Monthly cost (INR) |
|---|---|---|---|---|
| 50 | 2 min | India | ~$1.10 | ~₹92 |
| 100 | 2 min | India | ~$2.20 | ~₹185 |
| 200 | 2 min | India | ~$4.40 | ~₹370 |
| 500 | 3 min | India | ~$16.50 | ~₹1,386 |
| 100 | 2 min | US | ~$1.20 | ~₹101 |
| 200 | 2 min | Mixed (India + US) | ~$3.80 | ~₹319 |

> Telnyx cost is very low at current pilot volume. It only becomes significant at 500+ calls/month.

---

## 4. Vercel (CRM + Backend Hosting)

| Project | Plan | Cost |
|---|---|---|
| CRM (`crm.cortexflow.in`) | Hobby (free) | $0 / ₹0 |
| Backend API (`cortex-backend-api.vercel.app`) | Hobby (free) | $0 / ₹0 |

**Free tier limits:**
- 100 GB-hours serverless function execution/month
- 10-second function timeout (backend API calls must complete in 10s)
- 100GB bandwidth/month
- Unlimited deployments

> At pilot scale these limits are not a concern. If call volume scales significantly (>500 calls/day), consider Vercel Pro ($20/user/month — ~₹1,680) for longer timeouts and higher limits.

---

## 5. Supabase (Database + Auth)

| Plan | Cost (USD) | Cost (INR) | Limits |
|---|---|---|---|
| Free | $0 | ₹0 | 500 MB database, 2 GB storage, 50,000 monthly active users |
| Pro | $25/month | ₹2,100/month | 8 GB database, 100 GB storage, unlimited users |

> At pilot scale (a few tenants, thousands of rows): **free tier is sufficient**.
> Move to Pro ($25/month — ₹2,100) when the database approaches 400 MB or you need daily backups and point-in-time recovery.

---

## 6. Services Not Currently Costing Anything

| Service | Why it's free | When it stops being free |
|---|---|---|
| **Twilio WhatsApp** | Sandbox mode (test numbers only) | WhatsApp Business API real number: ~$0.005–$0.015/msg (~₹0.42–₹1.26/msg) |
| **Deepgram** | Free tier (200 hours/month transcription) | Above 200 hrs/month: ~$0.0043/min (~₹0.36/min) |
| **Resend** | Free tier (3,000 emails/month, domain verified) | Above 3,000 emails: $20/month (~₹1,680) for 50,000 emails |
| **Groq** | Free tier (very generous rate limits) | If Groq removes free tier: ~$0.59/1M tokens (~₹50/1M) — still very cheap |

---

## Realistic Monthly Cost Scenarios

### Scenario A — Pilot / Demo (50 calls/month, India)

| Item | USD | INR |
|---|---|---|
| GCP VM + IP + disk | $27 | ₹2,268 |
| OpenAI Realtime (50 calls × 2 min) | $23 | ₹1,932 |
| Telnyx (50 calls × 2 min, India) | $1.10 | ₹92 |
| Vercel / Supabase / Resend | $0 | ₹0 |
| **Total** | **~$51/month** | **~₹4,284/month** |

### Scenario B — Small Business (200 calls/month, mixed India/US)

| Item | USD | INR |
|---|---|---|
| GCP VM + IP + disk | $27 | ₹2,268 |
| OpenAI Realtime (200 calls × 2.5 min) | $138 | ₹11,592 |
| Telnyx (200 calls × 2.5 min, mixed) | $5.50 | ₹462 |
| Vercel / Supabase | $0 | ₹0 |
| **Total** | **~$171/month** | **~₹14,364/month** |

### Scenario B (Groq mode) — Same volume, much cheaper AI

| Item | USD | INR |
|---|---|---|
| GCP VM + IP + disk | $27 | ₹2,268 |
| Groq LLM | $0 (free tier) | ₹0 |
| Deepgram STT + TTS | $0 (free tier) | ₹0 |
| Telnyx (200 calls × 2.5 min) | $5.50 | ₹462 |
| **Total** | **~$33/month** | **~₹2,772/month** |

> Switching to Groq mode (`AGENT_MODE=groq` in `/opt/cortex/agent/.env`) drops AI costs to near zero while delivering comparable call quality. Strongly recommended as you scale.

### Scenario C — Growing Operation (500 calls/month)

| Item | OpenAI mode (USD) | OpenAI mode (INR) | Groq mode (USD) | Groq mode (INR) |
|---|---|---|---|---|
| GCP VM + IP + disk | $27 | ₹2,268 | $27 | ₹2,268 |
| AI (LLM + STT + TTS) | $345 | ₹28,980 | $0 (free) | ₹0 |
| Telnyx (500 × 2.5 min, India) | $14 | ₹1,176 | $14 | ₹1,176 |
| Supabase Pro (may need at this scale) | $25 | ₹2,100 | $25 | ₹2,100 |
| **Total** | **~$411/month** | **~₹34,524/month** | **~$66/month** | **~₹5,544/month** |

---

## Cost Optimisation Tips

1. **Switch to Groq mode for high volume** — drops AI costs from ~$0.46/call (~₹39) to effectively ₹0 at current scale. Single env var change (`AGENT_MODE=groq`).

2. **Use GCP Spot VMs when idle** — not recommended for 24/7 production (can be preempted), but saves ~60–70% in dev/staging.

3. **Reserved IP is worth it** — at $3/month (~₹252), avoids the manual IP update dance every VM restart.

4. **Supabase free tier covers pilot** — upgrade to Pro ($25/month — ₹2,100) only when you genuinely need backups or >400 MB data.

5. **When Twilio goes live** — WhatsApp messages at $0.005–$0.015 each (~₹0.42–₹1.26). For 200 calls/month (4 messages each): ~$4–12/month (~₹336–1,008). Very manageable.

---

*Prices are approximate and subject to change. All USD values converted to INR at ₹84/$ (April 2026). GCP asia-south1 pricing as of April 2026. OpenAI pricing based on published gpt-4o-realtime-preview rates.*
