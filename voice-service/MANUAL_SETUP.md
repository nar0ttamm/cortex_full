# Manual setup — AI voice stack

Configure **`voice-service/.env`** on the GCP VM (see **`.env.example`** for names). Vendor dashboards: Supabase, Google AI Studio, Deepgram, ElevenLabs, Telnyx.

---

## Supabase

Use the **Session pooler** URI (IPv4), not direct `db.*`. URL-encode special characters in the password.

---

## Google AI (Gemini)

`GEMINI_API_KEY` — not OpenAI by default. Set **`GEMINI_MODEL`** (e.g. `gemini-2.0-flash`). Unversioned ids like `gemini-1.5-flash` often return **404** from the current Generative Language API.

---

## Deepgram

`DEEPGRAM_API_KEY`. Optional: `DEEPGRAM_MODEL`, `DEEPGRAM_LANGUAGE`, `DEEPGRAM_SAMPLE_RATE`, etc.

---

## ElevenLabs

`TTS_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_OUTPUT_FORMAT=pcm_16000`, etc.

---

## Docker FreeSWITCH + Node

- **Bridge networking:** set **`AUDIO_INGRESS_WS_BASE=ws://172.17.0.1:5000`** (Docker bridge gateway to the host where `cortex_voice` listens), not `ws://127.0.0.1:5000`.
- **`--network host`:** use **`ws://127.0.0.1:5000`** (or omit and let defaults apply).

### Image choice (STT vs trunk)

- **`drachtio/drachtio-freeswitch-mrf`** includes **`mod_audio_fork`** (`uuid_audio_fork` for Deepgram). The stock image only ships **`drachtio_mrf`**; add **`external.xml`** + **`external/telnyx.xml`** via bind mounts (see **`freeswitch/drachtio/external.xml`**, **`scripts/vm-switch-drachtio-freeswitch.sh`** on the VM after **`git pull`**). With **`--network host`**, set **`AUDIO_INGRESS_WS_BASE=ws://127.0.0.1:5000`**.
- **`safarov/freeswitch`** has a normal **`external`** profile and Telnyx-style gateways, but typical builds **do not** ship **`mod_audio_fork`** — `uuid_audio_fork` will not work, so the realtime STT path cannot run on that image alone.

### Telnyx bind-mount gotcha

The host path **`/opt/freeswitch-config/telnyx.xml` must be a file**, not a directory. If it is a directory, Docker mounts an empty tree, Sofia shows **Invalid Gateway**, and outbound SIP breaks.

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
