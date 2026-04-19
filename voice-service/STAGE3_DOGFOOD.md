# Stage 3 — Dogfood checklist (≥10 real Indian mobile calls)

Run on **staging or production voice VM** with `pm2 logs` / `[metrics]` visible. After each call, fill one row.

| # | Date | Mobile (last 4) | STT ok? | CRM outcome ok? | Latency feel (1–5) | Barge-in tried? | Notes / failure |
|---|------|-----------------|--------|-------------------|---------------------|-----------------|-----------------|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |
| 7 | | | | | | | |
| 8 | | | | | | | |
| 9 | | | | | | | |
| 10 | | | | | | | |

## What to grep on the VM

- **Merged STT fragments (false end-of-turn):** `stt_false_eot_merged` or log line `STT merged`
- **Barge-in:** `barge_in_pcm` or `barge-in (PCM energy)`
- **Early hangup (no answer / busy):** `early_hangup` in DB `call_events` or `[backendNotify] calls/result` with `no_answer` / `user_busy`

## Exit criteria

- Top repeating issues get an owner and **fix / won’t fix v1** in the roadmap progress log.
