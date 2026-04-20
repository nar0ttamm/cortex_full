/**
 * CortexFlow PM2 Microservices Configuration
 *
 * Services:
 *   cortex-livekit   — LiveKit media server (port 7880)
 *   cortex-sip       — LiveKit SIP bridge (port 5081, RTP 10100-20000)
 *   cortex-agent     — Python AI voice agent worker
 *   cortex-voice     — Legacy FreeSWITCH/ESL voice service (kept as fallback)
 */

module.exports = {
  apps: [
    // ── 1. LiveKit Server ────────────────────────────────────────────────────
    {
      name: 'cortex-livekit',
      script: '/opt/cortex/livekit/livekit-server',
      args: '--config /opt/cortex/livekit/config.yaml',
      cwd: '/opt/cortex/livekit',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '5s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/var/log/cortex/livekit-out.log',
      error_file: '/var/log/cortex/livekit-err.log',
    },

    // ── 2. LiveKit SIP Bridge (via Docker image) ─────────────────────────────
    {
      name: 'cortex-sip',
      script: '/opt/cortex/livekit/start-sip.sh',
      interpreter: 'bash',
      cwd: '/opt/cortex/sip',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/var/log/cortex/sip-out.log',
      error_file: '/var/log/cortex/sip-err.log',
    },

    // ── 3. Python AI Agent Worker ────────────────────────────────────────────
    {
      name: 'cortex-agent',
      script: '/opt/cortex/agent/venv/bin/python',
      args: 'main.py start',
      cwd: '/opt/cortex/agent',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/var/log/cortex/agent-out.log',
      error_file: '/var/log/cortex/agent-err.log',
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },

    // ── 4. Legacy cortex_voice (FreeSWITCH/ESL) — kept as fallback ──────────
    {
      name: 'cortex_voice',
      script: '/opt/cortex_voice/voice-service/dist/index.js',
      cwd: '/opt/cortex_voice/voice-service',
      interpreter: 'node',
      autorestart: true,
      watch: false,
      max_restarts: 5,
      min_uptime: '10s',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: '/var/log/cortex/voice-out.log',
      error_file: '/var/log/cortex/voice-err.log',
      env_file: '/opt/cortex_voice/voice-service/.env',
    },
  ],
};
