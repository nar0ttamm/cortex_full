# cortex_voice Service — Deployment Guide

## Overview

The `cortex_voice` service runs on a **Google Cloud VPS (VM instance)**, not Vercel.
It handles real-time audio streaming, AI conversation, and FreeSWITCH telephony.

---

## Step 1 — Create a GCP VM Instance

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to **Compute Engine → VM instances → Create Instance**
3. Recommended configuration:
   - **Machine type:** `e2-medium` (2 vCPU, 4 GB RAM) — ~$25/month
   - **OS:** Ubuntu 22.04 LTS
   - **Disk:** 20 GB SSD
   - **Region:** asia-south1 (Mumbai) for India, us-central1 for US
4. Under **Firewall**, check:
   - ✅ Allow HTTP traffic
   - ✅ Allow HTTPS traffic
5. Click **Create**

---

## Step 2 — Open Required Firewall Ports

In GCP console → **VPC Network → Firewall rules → Create firewall rule**:

| Rule name       | Protocol | Ports         | Purpose                  |
|-----------------|----------|---------------|--------------------------|
| voice-api       | TCP      | 5000          | cortex_voice HTTP API     |
| freeswitch-sip  | TCP/UDP  | 5060, 5061    | SIP signaling            |
| freeswitch-rtp  | UDP      | 16384-32768   | RTP audio streams        |
| freeswitch-esl  | TCP      | 8021          | ESL management (internal)|

---

## Step 3 — Install FreeSWITCH

SSH into your VM:
```bash
ssh -i ~/.ssh/your-key user@YOUR_VM_IP
```

Install FreeSWITCH:
```bash
# Add FreeSWITCH apt repository
apt-get update && apt-get install -y wget gnupg2
wget -O - https://files.freeswitch.org/repo/deb/debian-release/fsstretch-archive-keyring.asc | apt-key add -
echo "deb http://files.freeswitch.org/repo/deb/debian-release/ buster main" > /etc/apt/sources.list.d/freeswitch.list
apt-get update && apt-get install -y freeswitch freeswitch-mod-sofia freeswitch-mod-event-socket \
  freeswitch-mod-commands freeswitch-mod-dptools freeswitch-mod-audio-stream

# Enable and start FreeSWITCH
systemctl enable freeswitch
systemctl start freeswitch
```

---

## Step 4 — Configure SIP Trunk

Register with a SIP trunk provider. Recommended affordable options:
- **Twilio SIP Trunking** — easy setup, pay-per-minute
- **Telnyx** — very cheap, India DID numbers available
- **Exotel SIP** — India-focused, already integrated

### Telnyx Setup (recommended for India):
1. Create account at [telnyx.com](https://telnyx.com)
2. Buy an Indian DID number
3. Create a SIP Connection (Credentials-based auth)
4. Note: SIP username, password, host

### Configure FreeSWITCH gateway (`/etc/freeswitch/sip_profiles/external/sip_trunk.xml`):
```xml
<include>
  <gateway name="sip_trunk">
    <param name="username" value="YOUR_SIP_USERNAME"/>
    <param name="password" value="YOUR_SIP_PASSWORD"/>
    <param name="realm" value="sip.telnyx.com"/>
    <param name="proxy" value="sip.telnyx.com"/>
    <param name="register" value="true"/>
  </gateway>
</include>
```

Reload: `fs_cli -x "sofia profile external rescan"`

---

## Step 5 — Install Node.js and Deploy cortex_voice

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install PM2 process manager
npm install -g pm2

# Clone or copy the voice-service directory to VM
# Option A: Git clone
git clone https://github.com/nar0ttamm/cortex_backend /opt/cortex_voice
cd /opt/cortex_voice/voice-service

# Option B: scp from local
# scp -r voice-service/ user@VM_IP:/opt/cortex_voice/

# Install dependencies and build
npm install
npm run build

# Configure environment
cp .env.example .env
nano .env   # Fill in all values

# Start with PM2
pm2 start dist/index.js --name cortex_voice
pm2 save
pm2 startup
```

---

## Step 6 — Set Up SSL with Nginx (Recommended)

```bash
apt-get install -y nginx certbot python3-certbot-nginx

# Configure nginx reverse proxy
cat > /etc/nginx/sites-available/cortex_voice << 'EOF'
server {
    server_name voice.cortexflow.in;  # your domain
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/cortex_voice /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d voice.cortexflow.in
```

---

## Step 7 — Configure Backend Environment Variables

Add to your Vercel backend environment variables:

```env
VOICE_SERVICE_URL=https://voice.cortexflow.in
VOICE_SECRET=your-strong-shared-secret
```

---

## Step 8 — Test the System

```bash
# Test voice service health
curl https://voice.cortexflow.in/health

# Initiate a test call via backend
curl -X POST https://cortex-backend-api.vercel.app/v1/calls/start \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "b50750c7-0a91-4cd4-80fa-8921f974a8ec",
    "lead_id": "YOUR_LEAD_ID"
  }'
```

---

## Cost Estimate (per 100 calls, ~2 min avg)

| Service         | Cost/100 calls  |
|-----------------|-----------------|
| Deepgram STT    | ~$0.80          |
| Deepgram TTS    | ~$0.30          |
| Gemini 1.5 Flash| ~$0.10          |
| Telnyx SIP      | ~$0.60          |
| GCP VM (shared) | ~$0.08          |
| **Total**       | **~$1.88**      |

Less than **$0.02 per call**.

---

## FreeSWITCH ESL Integration Note

The current `freeswitchBridge.ts` contains the architectural skeleton.
To connect real audio, you'll need to implement the ESL socket connection using the `node-esl` package.

The key integration point is `_startConversationPipeline()` — it needs to:
1. Connect to FreeSWITCH ESL (`esl.Connection`)
2. Subscribe to CHANNEL_CREATE events for the call UUID
3. Route the RTP audio stream to `sttStream.write()`
4. Route TTS audio output back via `uuid_displace` or `mod_audio_stream`

This full ESL wiring is telephony-specific and requires SIP trunk credentials to test live.
