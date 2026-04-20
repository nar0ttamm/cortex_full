# CortexFlow — Monthly Cost Forecast

> Last updated: April 2026
> Scope: 24/7 VM with static IP. Twilio (WhatsApp) and Deepgram excluded — currently free/sandbox. Resend email is on verified domain (free tier, 3k emails/month — excluded below as effectively free at pilot scale).

---

## Summary Table

| Service | What for | Monthly cost |
|---|---|---|
| GCP VM (e2-medium, asia-south1) | All voice services | ~$18–20 |
| GCP Static IP | Fixed public IP | ~$3 |
| GCP Boot Disk (30 GB SSD) | OS + code + logs | ~$5 |
| **GCP Total** | | **~$26–28/month** |
| OpenAI Realtime API | AI voice conversations | $8–200 (usage-based) |
| Telnyx | PSTN call minutes | $2–25 (usage-based) |
| Vercel | CRM + Backend hosting | $0 (free tier) |
| Supabase | Database + Auth | $0 (free tier) |
| **TOTAL** | | **~$36–255/month** |

Range is wide because OpenAI and Telnyx are pure pay-per-use. See breakdowns below.

---

## 1. Google Cloud Platform VM

**Machine:** `e2-medium` — 2 vCPU (burstable), 4 GB RAM
**Region:** `asia-south1-c` (Mumbai)
**Uptime:** 24/7 (730 hours/month)

### Compute

| Item | Rate | Monthly |
|---|---|---|
| e2-medium on-demand | ~$0.0352/hr | ~$25.70 |
| GCP sustained use discount (auto, ~30% for 100% usage) | −30% | −$7.71 |
| **Effective compute cost** | | **~$18.00** |

> GCP automatically applies sustained use discounts when a VM runs for the full month — no action needed.

### Storage

| Item | Size | Rate | Monthly |
|---|---|---|---|
| SSD persistent boot disk | 30 GB | $0.170/GB | ~$5.10 |
| (Alternative: standard disk) | 30 GB | $0.040/GB | ~$1.20 |

> Recommendation: use SSD for better I/O on the voice service. $5.10/month is worth it.

### Static IP

| Item | Rate | Monthly |
|---|---|---|
| Reserved regional external IP (attached to running VM) | $0.004/hr | ~$2.92 |

> A static IP costs nothing extra when attached to a running instance in some configurations, but GCP now charges ~$0.004/hr for standard tier external IPs. Budget ~$3/month to be safe.

### GCP Total (24/7, static IP, SSD)

| | |
|---|---|
| Compute (with sustained discount) | ~$18.00 |
| SSD boot disk (30 GB) | ~$5.10 |
| Static IP | ~$2.92 |
| **Monthly GCP total** | **~$26 – $28** |

---

## 2. OpenAI Realtime API

**Model:** `gpt-4o-realtime-preview`
**Mode:** Audio-in / Audio-out (WebSocket, full duplex)

### Pricing (current)

| Token type | Rate |
|---|---|
| Audio input | $100.00 / 1M tokens |
| Audio output | $200.00 / 1M tokens |
| Text input (system prompt, function calls) | $5.00 / 1M tokens |
| Text output | $20.00 / 1M tokens |

**Audio token estimate:** ~1,500 tokens per minute of speech (OpenAI approximation)

### Per-call cost estimate

| | 2-min call | 3-min call | 5-min call |
|---|---|---|---|
| Audio in (lead speaking) | $0.15 | $0.23 | $0.38 |
| Audio out (agent speaking) | $0.30 | $0.45 | $0.75 |
| Text (prompt + function tools) | ~$0.01 | ~$0.01 | ~$0.02 |
| **Per-call total** | **~$0.46** | **~$0.69** | **~$1.15** |

> Average call in practice: 2–3 minutes for a qualifying conversation.

### Monthly forecast by volume

| Calls/month | Avg duration | Monthly OpenAI cost |
|---|---|---|
| 50 | 2 min | ~$23 |
| 100 | 2 min | ~$46 |
| 200 | 2.5 min | ~$138 |
| 500 | 2.5 min | ~$345 |
| 50 | 3 min | ~$35 |
| 100 | 3 min | ~$69 |
| 200 | 3 min | ~$138 |

> **For a typical pilot (50–100 calls/month):** expect $23–70/month in OpenAI costs.
>
> **Cost reduction option:** Switch `AGENT_MODE=groq` in the agent `.env`. Groq LLM is currently free (generous free tier), Deepgram is also free tier — this drops the LLM/STT/TTS cost to ~$0 at current volume while maintaining good quality.

---

## 3. Telnyx (SIP / PSTN Calls)

**Usage:** Outbound SIP calls via Telnyx SIP trunk to lead phone numbers.

### Pricing

| Destination | Per-minute rate |
|---|---|
| India mobile (local) | ~$0.011/min |
| India landline | ~$0.008/min |
| US mobile/landline | ~$0.006/min |
| UK mobile | ~$0.012/min |

**Additional:**
- SIP trunk: pay-as-you-go (no monthly fee)
- Phone number (DID): ~$1.00–2.00/month per number (optional, for caller ID)
- Inbound calls: ~$0.004/min (if you add inbound support later)

### Monthly forecast by volume

| Calls/month | Avg duration | Destination | Monthly Telnyx cost |
|---|---|---|---|
| 50 | 2 min | India | ~$1.10 |
| 100 | 2 min | India | ~$2.20 |
| 200 | 2 min | India | ~$4.40 |
| 500 | 3 min | India | ~$16.50 |
| 100 | 2 min | US | ~$1.20 |
| 200 | 2 min | Mixed (India + US) | ~$3.80 |

> Telnyx cost is very low at current pilot volume. It only becomes significant at 500+ calls/month.

---

## 4. Vercel (CRM + Backend Hosting)

| Project | Plan | Cost |
|---|---|---|
| CRM (`crm.cortexflow.in`) | Hobby (free) | $0 |
| Backend API (`cortex-backend-api.vercel.app`) | Hobby (free) | $0 |

**Free tier limits:**
- 100 GB-hours serverless function execution/month
- 10-second function timeout (backend API calls must complete in 10s)
- 100GB bandwidth/month
- Unlimited deployments

> At pilot scale these limits are not a concern. If call volume scales significantly (>500 calls/day), consider Vercel Pro ($20/user/month) for longer timeouts and higher limits.

---

## 5. Supabase (Database + Auth)

| Plan | Cost | Limits |
|---|---|---|
| Free | $0 | 500 MB database, 2 GB storage, 50,000 monthly active users |
| Pro | $25/month | 8 GB database, 100 GB storage, unlimited users |

> At pilot scale (a few tenants, thousands of rows): **free tier is sufficient**.
> Move to Pro ($25/month) when the database approaches 400 MB or you need daily backups and point-in-time recovery.

---

## 6. Services Not Currently Costing Anything

| Service | Why it's free | When it stops being free |
|---|---|---|
| **Twilio WhatsApp** | Sandbox mode (test numbers only) | When you move to WhatsApp Business API with a real number: ~$0.005–$0.015/message |
| **Deepgram** | Free tier (200 hours/month transcription) | Above 200 hours/month: ~$0.0043/minute ($4.30/1000 min) |
| **Resend** | Free tier (3,000 emails/month, domain verified) | Above 3,000 emails: $20/month for 50,000 emails |
| **Groq** | Free tier (very generous rate limits) | If Groq removes free tier: ~$0.59/1M tokens (still very cheap) |

---

## Realistic Monthly Cost Scenarios

### Scenario A — Pilot / Demo (50 calls/month, India)
| Item | Cost |
|---|---|
| GCP VM + IP + disk | $27 |
| OpenAI Realtime (50 calls × 2 min) | $23 |
| Telnyx (50 calls × 2 min, India) | $1.10 |
| Vercel / Supabase / Resend | $0 |
| **Total** | **~$51/month** |

### Scenario B — Small Business (200 calls/month, mixed India/US)
| Item | Cost |
|---|---|
| GCP VM + IP + disk | $27 |
| OpenAI Realtime (200 calls × 2.5 min) | $138 |
| Telnyx (200 calls × 2.5 min, mixed) | $5.50 |
| Vercel / Supabase | $0 |
| **Total** | **~$171/month** |

### Scenario B (Groq mode) — Same volume, much cheaper AI
| Item | Cost |
|---|---|
| GCP VM + IP + disk | $27 |
| Groq LLM | $0 (free tier) |
| Deepgram STT + TTS | $0 (free tier) |
| Telnyx (200 calls × 2.5 min) | $5.50 |
| **Total** | **~$33/month** |

> Switching to Groq mode (`AGENT_MODE=groq` in `/opt/cortex/agent/.env`) drops AI costs to near zero while delivering comparable call quality. Strongly recommended as you scale.

### Scenario C — Growing Operation (500 calls/month)
| Item | OpenAI mode | Groq mode |
|---|---|---|
| GCP VM + IP + disk | $27 | $27 |
| AI (LLM + STT + TTS) | $345 | $0 (free) |
| Telnyx (500 × 2.5 min, India) | $14 | $14 |
| Supabase Pro (may need at this scale) | $25 | $25 |
| **Total** | **~$411/month** | **~$66/month** |

---

## Cost Optimisation Tips

1. **Switch to Groq mode for high volume** — drops AI costs from ~$0.46/call to effectively $0 at current scale. Single env var change.

2. **Use GCP Spot VMs when idle** — not recommended for 24/7 production (can be preempted), but saves ~60-70% in dev/staging.

3. **Reserved IP is worth it** — at $3/month, avoids the manual IP update dance every VM restart.

4. **Supabase free tier covers pilot** — upgrade to Pro ($25/month) only when you genuinely need backups or >400 MB data.

5. **When Twilio goes live** — WhatsApp messages at $0.005–$0.015 each. For 200 calls/month (4 messages each): ~$4–12/month. Very manageable.

---

*Prices are approximate and subject to change. All USD. GCP asia-south1 pricing as of April 2026. OpenAI pricing based on published gpt-4o-realtime-preview rates.*
