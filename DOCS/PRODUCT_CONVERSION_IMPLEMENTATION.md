# CortexFlow — Product Conversion Implementation

**Date:** 20 September 2026  
**Rule:** Reuse first. Only missing/weak parts were built. Production calling loop was not redesigned.

---

## 1. Existing functionality discovered

Already live and reused:

- Tenant → project → `kb_products` → leads → `call_queue` → Pipecat → Telnyx → `/v1/calls/result`
- `lead_context` for budget, location, requirement, interest, objections, callback time, last summary
- Appointment persistence via `appointmentFromCall` + reminders
- Callback WhatsApp/email notifications
- `leads.assigned_to`, `user_profiles`, team members
- Dashboard funnel / sources / call outcomes
- `tenant_usage` + Usage page
- Communications log, transcripts, lead statuses including `qualified` and `callback_scheduled`

## 2. What was reused

- `lead_context` as the intelligence store (new columns only)
- `leads.metadata` for `needs_project_assignment`
- `calls.project_id` as the record of which project knowledge was used
- `assigned_to` for human handoff (no new assignment system)
- Existing appointment and reminder jobs
- Existing usage counters; leads-this-month is a COUNT, not a new table
- Existing dashboard charts, lead detail, usage, and tenant settings pages

## 3. What was changed

### Project-aware selling
- Ingest, webhook, and CSV accept `project_id`
- Resolver: supplied → tenant `default_project_id` → single active project → else block enqueue
- Manual/start call refuses a generic dial when the project is ambiguous (HTTP 409)
- Assigning a project on PATCH clears the flag and enqueues in 60s if not yet called
- Call brief still uses `buildCallContext` + `selectProducts` for that project

### Lead intelligence + score
- After `/v1/calls/result`, persist score, temperature, next action, handoff, signals, summary
- Deterministic 0–100 score; `null` until a real conversation exists
- Missing facts stay null / “Not mentioned”

### Callbacks
- Parse relative times (tomorrow / 11am, IST +330)
- If a usable time exists: `callback_scheduled`, enqueue a queue job, show on timeline
- If no usable time: do not invent a datetime

### Analytics / ROI / usage
- `GET /v1/analytics/conversion` — funnel, rates, time-to-first-call, source funnel, needs-attention, estimated pipeline
- Optional `tenants.settings.average_deal_value` labeled **Estimated pipeline**, never revenue
- Usage “This month” adds leads processed + active users from real counts

### CRM
- Dashboard: contacted / qualified / appointments / time-to-first-call / needs attention / source opportunities
- Lead detail: score, temperature, next action, summary, qualification, project + salesperson assign
- Data import/manual add: optional project
- Tenant settings: average deal value

## 4. Database changes

File: `backend/migrations/20260920_lead_context_conversion.sql`  
Applied live as `lead_context_conversion` (idempotent `ADD COLUMN IF NOT EXISTS`).

| Column | Type | Purpose |
|---|---|---|
| `score` | integer | 0–100 or null |
| `temperature` | text | cold / warm / qualified / hot |
| `next_action` | text | call_now / callback / appointment / human_followup / assign_project / nurture / closed |
| `next_action_at` | timestamptz | When the next action is due |
| `human_handoff` | boolean | Qualified/hot → human follow-up |
| `ai_confidence` | text | `rule` or `unknown` — not ML |
| `score_signals` | jsonb | Explainable reasons |
| `preferred_product` | text | If mentioned |
| `decision_maker` | text | If inferable |

No tables created. No columns dropped or renamed.

## 5. API changes

| Endpoint | Change |
|---|---|
| `POST /v1/lead/ingest` | Accepts `project_id`; returns `{ project, queued }` |
| `GET /v1/leads/:tenantId` | Joins project, `lead_context`, assignee, `first_call_at` |
| `PATCH /v1/leads/:leadId` | `project_id`, `assigned_to`; enqueue after project assign |
| `GET /v1/analytics/conversion` | Tenant-scoped conversion metrics |
| `GET /v1/calls/usage/:tenantId` | Adds `leads_processed`, `active_users`; tenant mismatch → 403 |
| `POST /v1/calls/result` | Persist conversion + callback enqueue (post-commit, best-effort) |
| `POST /v1/calls/start` | 409 if project cannot be resolved |

Webhook ingest now writes `project_id` and skips enqueue when assignment is required.

## 6. CRM changes

- `crm/app/page.tsx` + `DashboardAnalyticsCharts` — outcome KPIs, needs attention, source funnel, estimated pipeline
- `crm/app/leads/[id]/page.tsx` + `LeadConversionPanel` — sales workspace
- `crm/app/leads/page.tsx` — score/temperature on list
- `crm/app/data/page.tsx` + import — optional `project_id`
- `crm/app/tenant/page.tsx` — average deal value
- `crm/app/usage/page.tsx` — this-month conversion usage
- Types + `flattenLead` — pass through intelligence fields

## 7. Analytics changes

Primary funnel (real rows only):

Leads → Called → Connected → Qualified → Appointments → Confirmed

Rates stay `null` / “Not tracked” when the denominator is 0.

Time to first call = `MIN(calls.started_at) - leads.created_at` for rows that have both.

Estimated pipeline = optional deal value × qualified/appointment count. Labeled estimated. Never “revenue generated”.

## 8. Tests added

`backend/tests/conversion.test.js` (`npm test` in `backend/`):

1. Score null with no conversation
2. Not-interested stays cold
3. Appointment + high intent ≥ 81 hot
4. Project supplied / single / multiple
5. Callback parse + missing time
6. Next-action priority
7. Time-to-first-call
8. Metrics never invent rates/pipeline
9. `rate(n, 0) === null`

## 9. Known limitations

- Telnyx account still needs recharge / D51 verification for live dials — voice infra was not changed
- Score is rule-based, not ML (`ai_confidence = rule`)
- Callback parse covers common English/Hindi relative times; vague “call later” stays null
- Acme has two projects, so new ingest without `project_id` waits for assignment (intentional)
- Existing 17 leads with `project_id` null are not backfilled — assign in the UI
- CRM browser login could not be completed in this environment; UI wiring is in code
- No Stripe / plan enforcement

## 10. Remaining product gaps

- Closed-won revenue field if a customer later wants real revenue (do not label pipeline as revenue)
- WhatsApp/email send from the next-action card still uses the existing Communications page
- Historical leads need a one-time project assign for knowledge-aware callbacks

---

## Pre-deployment corrective pass

**Date:** 20 September 2026  
No commit, push, or deploy in this pass.

### Project routing

Shared `resolveProject` / `resolveProjectForLead` used by ingest, webhook, Meta, CSV (via ingest), manual add, and Start AI Call.

Order:

1. Explicit `project_id` (tenant-owned only)
2. `tenants.settings.default_project_id`
3. `tenants.settings.source_project_map[source]` — only an explicit map, never a guess
4. Exactly one active project
5. Unresolved → `needs_project_assignment`, no enqueue

Invalid `project_id` is not remapped to another project.

Tenant settings now expose **Default project**. No new table.

### Human handoff UX

Lead detail shows **HUMAN FOLLOW-UP RECOMMENDED** when `human_handoff`, temperature is hot, or score ≥ 81. Assignment still uses `assigned_to`.

### AI → human brief

Same lead detail page. Sales brief card: score, temperature, project, requirement, budget, timeline, intent, objection, AI summary, next action, Call now / assign salesperson. Transcript is not duplicated.

### Next action UX

Uses stored `next_action` / `next_action_at`. Empty state: **No next action scheduled**. Vague callback: **Callback requested — Time not specified**.

### Tests / builds

See final report. Voice, JWT, Telnyx, Pipecat, RLS, secrets were not changed.
