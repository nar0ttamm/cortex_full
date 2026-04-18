# GCP Session Guide — CortexFlow Voice Service

Every time you want to work on or test the AI calling pipeline, follow this guide start to finish.

---

## STARTING A SESSION

### Step 1 — Start the VM
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Navigate to **Compute Engine → VM instances**
3. Find `instance-20260412-194529`
4. Click the **⋮ (3 dots)** → **Start / Resume**
5. Wait ~30 seconds until the status turns green (Running)

> **Note:** Your VM's public IP may change every time you start it. Get the new IP in Step 2.

---

### Step 2 — Get the Current Public IP
1. On the VM instances page, look at the **External IP** column next to your instance
2. Copy it — you'll need it to update Vercel env vars if it changed

---

### Step 3 — SSH into the VM
1. Click the **SSH** button next to your instance (opens browser terminal)
2. Wait for the terminal to connect

---

### Step 4 — Start the Voice Service
Once inside the SSH terminal, run:

```bash
pm2 resurrect
```

Check it's running:

```bash
pm2 status
```

You should see `cortex_voice` with status **online**.

Verify the health endpoint:

```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status":"ok","service":"cortex_voice","timestamp":"..."}
```

---

### Step 5 — Check FreeSWITCH is Running
```bash
sudo docker ps
```

You should see a running container with `freeswitch` in the name.

If it's not running, start it:

```bash
sudo docker start $(sudo docker ps -aq --filter ancestor=safarov/freeswitch)
```

---

### Step 6 — Update Vercel if IP Changed
If the VM's public IP changed since last session:

1. Go to [vercel.com](https://vercel.com) → **cortex-backend-api** → **Settings** → **Environment Variables**
2. Update `VOICE_SERVICE_URL` to `http://<NEW_IP>:5000`
3. Go to **Deployments** → click **⋮** on the latest → **Redeploy**

---

### Step 7 — Verify Full Pipeline
From your local terminal (Windows), run:

```powershell
curl https://cortex-backend-api.vercel.app/health
```

If you see `healthy` and `database: connected`, the Vercel backend is up. (There is no `/v1/health` — use `/health`.)

**If `POST /v1/calls/start` returns `Voice service timeout`:** the Vercel app could not get a timely HTTP response from `VOICE_SERVICE_URL` (VM stopped, wrong IP in Vercel env, firewall, or an old `cortex_voice` build that waited for FreeSWITCH before replying). On the VM: `git pull origin main` (you should see new commits when main moves forward), `npm run build`, `pm2 restart cortex_voice`, then confirm the fast path exists: `grep -n "Respond immediately" /opt/cortex_voice/src/callController.ts`. Also: `curl -sS http://127.0.0.1:5000/health` and `pm2 logs cortex_voice --lines 80`.

---

## PM2 auto-start on boot (one-time setup on the VM)

**Goal:** After a VM reboot, `cortex_voice` (and any other PM2 apps) come back **without** running `pm2 resurrect` manually.

**Run on the VM** (SSH), when your process list is already correct:

1. Persist the current PM2 list to disk:
   ```bash
   pm2 save
   ```
2. Install the **systemd** startup hook (PM2 will print a command — copy and run it; it usually starts with `sudo`):
   ```bash
   pm2 startup
   ```
3. Execute exactly the command PM2 outputs (it sets `systemd` to launch PM2 as your user on boot).

**Verify (optional):** `sudo reboot`, wait, SSH again, then `pm2 status` — apps should be **online**.

**If you skip this:** Every time the VM starts you must run `pm2 resurrect` (or `pm2 start …`) before outbound calling works.

**Reminder:** `pm2 save` updates the **frozen process list**; `pm2 startup` registers **boot-time recovery**. Use both for a durable setup.

---

## ENDING A SESSION (Safe Shutdown)

### Step 1 — Stop the Voice Service (optional but clean)
In the SSH terminal:

```bash
pm2 stop cortex_voice
```

> PM2 will auto-restart it next time you run `pm2 resurrect` after starting the VM.

### Step 2 — Exit SSH
Just close the browser SSH tab.

### Step 3 — Stop the VM (IMPORTANT — prevents billing)
1. Go to **Compute Engine → VM instances**
2. Click **⋮** next to your instance → **Stop**
3. Wait until status shows **Stopped** (grey)

> A stopped VM does NOT charge for CPU/RAM. Only minimal disk storage is billed (~₹3/day).

---

## QUICK REFERENCE

| What | Where |
|------|-------|
| GCP Console | [console.cloud.google.com](https://console.cloud.google.com) |
| VM Name | `instance-20260412-194529` |
| Voice Service Port | `5000` |
| Health Check | `curl http://localhost:5000/health` |
| Vercel Backend | [cortex-backend-api.vercel.app](https://cortex-backend-api.vercel.app) |
| Vercel Dashboard | [vercel.com](https://vercel.com) |
| Supabase | [supabase.com/dashboard](https://supabase.com/dashboard) |
| PM2 Start All | `pm2 resurrect` (or auto if `pm2 startup` done) |
| PM2 boot hook | `pm2 startup` then run printed `sudo …` once |
| PM2 Status | `pm2 status` |
| PM2 Logs | `pm2 logs cortex_voice` |
| FreeSWITCH Check | `sudo docker ps` |

---

## TROUBLESHOOTING

**`pm2 resurrect` shows no processes:**
```bash
pm2 start /opt/cortex_voice/dist/index.js --name cortex_voice
pm2 save
```

**FreeSWITCH container not running:**
```bash
sudo docker ps -a
sudo docker start <container_id>
```

**Health check fails (connection refused):**
```bash
pm2 logs cortex_voice --lines 50
```

**Voice service can't connect to database:**
- Check `.env` file: `cat /opt/cortex_voice/.env`
- Verify Supabase project is not paused (free tier pauses after 1 week of inactivity)

---

## Persist Telnyx gateway (`telnyx.xml`) across Docker recreates

If you **recreate** the FreeSWITCH container, anything you added **inside** the container (for example `/etc/freeswitch/sip_profiles/external/telnyx.xml`) can be **lost**. Keep the file on the VM disk and **bind-mount** it.

### One-time setup

1. On the VM, create a folder and copy the gateway file out of the running container (adjust container name if yours differs):

```bash
sudo mkdir -p /opt/freeswitch-config
sudo docker cp freeswitch:/etc/freeswitch/sip_profiles/external/telnyx.xml /opt/freeswitch-config/telnyx.xml
sudo chmod 644 /opt/freeswitch-config/telnyx.xml
```

2. **Stop and remove** the old container (this does **not** delete the host file you just copied):

```bash
sudo docker stop freeswitch
sudo docker rm freeswitch
```

3. **Run again** with a **file** mount (keep your previous flags: `--network host`, `ESL_PASSWORD`, etc.). Example — **merge** this `-v` line into your real `docker run`:

```bash
sudo docker run -d --name freeswitch --restart unless-stopped --network host \
  -v /opt/freeswitch-config/telnyx.xml:/etc/freeswitch/sip_profiles/external/telnyx.xml:ro \
  -e ESL_PASSWORD='YOUR_ESL_PASSWORD' \
  safarov/freeswitch
```

4. Reload SIP (or restart the container once):

```bash
sudo docker exec freeswitch fs_cli -x "reloadxml"
sudo docker exec freeswitch fs_cli -x "sofia profile external rescan reload"
sudo docker exec freeswitch fs_cli -x "sofia status gateway telnyx"
```

You should still see **REGED**.

### After that

- Edit Telnyx credentials on the host: `sudo nano /opt/freeswitch-config/telnyx.xml`, then run the two `fs_cli` lines above (rescan + check gateway).

### `cortex_voice` env for backend-controlled calls

In `/opt/cortex_voice/.env` ensure:

- `USE_ESL_ORIGINATE=true`
- `SIP_CALLER_ID_E164=+1YOUR_TELNYX_NUMBER` (E.164, same as working `originate` tests)
- `SIP_GATEWAY_NAME=telnyx` (unless you renamed the gateway in XML)
- `VOICE_SECRET` matches Vercel **cortex-backend-api** `VOICE_SECRET`

Then: `cd /opt/cortex_voice && npm run build && pm2 restart cortex_voice`
