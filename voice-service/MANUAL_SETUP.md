# Manual setup — AI voice stack

Configure **`voice-service/.env`** on the GCP VM (see **`.env.example`** for names). Vendor dashboards: Supabase, Google AI Studio, Deepgram, ElevenLabs, Telnyx.

---

## Supabase

Use the **Session pooler** URI (IPv4), not direct `db.*`. URL-encode special characters in the password.

---

## Google AI (Gemini)

`GEMINI_API_KEY` — not OpenAI by default.

---

## Deepgram

`DEEPGRAM_API_KEY`. Optional: `DEEPGRAM_MODEL`, `DEEPGRAM_LANGUAGE`, `DEEPGRAM_SAMPLE_RATE`, etc.

---

## ElevenLabs

`TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_OUTPUT_FORMAT=pcm_16000`, etc.

---

## Docker FreeSWITCH + Node

If FreeSWITCH runs in Docker, set **`AUDIO_INGRESS_WS_BASE`** to the host reachable from the container (e.g. `ws://172.17.0.1:5000`), not `ws://127.0.0.1:5000`.

---

## FreeSWITCH / SIP (Telnyx)

Use a Drachtio (or similar) image with **`mod_audio_fork`**. Match **`FREESWITCH_ESL_PASSWORD`** to ESL in the container. Typical env:

```env
FREESWITCH_HOST=127.0.0.1
FREESWITCH_ESL_PORT=8021
FREESWITCH_ESL_PASSWORD=...
SIP_GATEWAY_NAME=telnyx
SIP_CALLER_ID_E164=+1...
USE_ESL_ORIGINATE=true
```

Configure the Sofia trunk on the VM per your provider (e.g. Telnyx credentials trunk in **`sip_profiles`**) — trunk XML lives **inside** the container unless you volume-mount it.

---

## Backend (Vercel) → voice VM

- `VOICE_SERVICE_URL=http://<VM_IP>:5000`
- **`VOICE_SECRET`** must match on backend and VM.
- GCP firewall: inbound **TCP 5000** if Vercel calls the VM directly.

---

## Test call from the VM

```bash
export TENANT_ID='<uuid>' LEAD_ID='<uuid>' PHONE='+1...'
cd /opt/cortex_voice/voice-service && bash scripts/start-call-on-vm.sh
```

Needs **`VOICE_SECRET`** in `.env` and the three exports above.

---

## Optional: Redis

`REDIS_URL=redis://127.0.0.1:6379` — in-memory fallback exists if unset.

---

## Metrics

`pm2 logs cortex_voice | grep '\[metrics\]'`
