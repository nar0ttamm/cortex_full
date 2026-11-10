# Feature status matrix

Status meanings:

1. **Implemented and verified** — code path exists and a test was executed, or production data shows the write.
2. **Implemented but unverified** — code path exists. This audit did not click it or call the provider.
3. **Partially implemented** — UI or API exists and an important half is missing or empty in production.
4. **Not implemented** — no code path.
5. **Obsolete** — still in the tree, not on the current boot path, or describes a replaced system.

"Verified" here does not mean a browser session was run. The CRM UI was not clicked.

| Feature | Status | Where | Evidence |
|---|---|---|---|
| Marketing homepage, pricing anchors, FAQ | 2 | `landing/app/page.tsx` | Vercel domain `www.cortexflow.in` is verified. Page content was not rendered in a browser |
| Signup and login | 2 | `crm/app/signup/page.tsx`, `login/page.tsx`, `middleware.ts` | Supabase auth plus onboarding route. Live DB has user profiles |
| Tenant creation | 2 | `crm/app/api/onboarding/complete/route.ts` | Tenant id = auth user id. Live tenants exist |
| Default team on signup | 2 | same file | `teams` has rows |
| Dashboard charts | 2 | `crm/app/page.tsx`, `DashboardAnalyticsCharts.tsx` | Client-side from leads already loaded |
| Dashboard CSV/PNG export | 2 | `exportCsv` in that component | Export of in-memory rows, not a server report |
| Lead list and detail | 2 | `crm/app/leads/page.tsx`, `[id]/page.tsx` | API list/detail. About 18 leads in the DB |
| Lead search and status/source filters | 2 | `filterLeads` in `leads/page.tsx` | Filters the already-fetched array. No server search |
| Kanban of lead statuses | 3 | same page, `viewMode === 'kanban'` | Fixed columns in the component. No per-tenant column config |
| Lead statuses | 3 | varchar default `new`, no CHECK | Values used in code: new, contacted, interested, qualified, not_interested, closed. Not a workflow engine |
| Lead assignment | 3 | `leads.assigned_to`, PATCH | Column and API exist. No round-robin. Team scope does not filter the list |
| Human handoff banner | 2 | `LeadConversionPanel.tsx`, `lead_context.human_handoff` | Flag from `leadScore.js`. No call transfer |
| Lead notes | 2 | `POST/DELETE /v1/leads/:id/notes` | Stored in `leads.metadata.notes`, not a table |
| Activity history | 3 | `activity_logs` and metadata status history | About 8 activity rows. Not a full audit log |
| CSV import | 2 | `crm/app/data/page.tsx`, `crm/app/api/import/route.ts` | Naive `split(',')`. Quoted commas will break |
| CSV export of leads | 2 | `handleExport` on the data page | Client download of loaded leads |
| Projects wizard | 2 | `crm/app/projects/page.tsx`, `ProjectWizard.tsx`, `routes/projects.js` | 3 project rows |
| Knowledge products | 3 | `kb_products`, `routes/knowledgeBase.js` | 3 product rows. `knowledge_bases` has 0 |
| Teams and user invite | 2 | `crm/app/team/page.tsx`, `routes/users.js`, `routes/projects.js` | Role check on create. 1 team member row |
| Usage counters | 2 | `crm/app/usage/page.tsx`, `usageTracker.js` | Page text says the numbers are not a plan limit |
| Plan selection at signup | 3 | signup plan cards, `tenants.plan` CHECK | Stored. Never enforced. No Stripe |
| Trial end | 3 | `trial_ends_at` set to now+3 days | No reader blocks login or dialing |
| Tenant settings | 2 | `crm/app/tenant/page.tsx`, `PATCH /v1/tenant/:id` | Any member can patch |
| Pipeline page | 3 | `crm/app/pipeline/page.tsx` | File exists. Sidebar `NAV` does not link it |
| Analytics page | 3 | `crm/app/analytics/page.tsx` | Same. Charts that users see are on `/` |
| Communications UI | 2 | `crm/app/communications/page.tsx` | `communications` has about 120 rows |
| WhatsApp send | 3 | `notificationService.sendWhatsApp` | AiSensy. `credentials` has 0 rows. Skips if unset |
| Email send | 3 | `sendEmail` via Resend | Per-tenant credentials empty. Global `RESEND_API_KEY` exists on the **CRM** Vercel project. Backend send path reads backend env. Whether the backend project has `RESEND_API_KEY` was not in the env name list returned for `cortex-backend-api` |
| Appointments UI | 3 | `crm/app/appointments/page.tsx`, `routes/appointments.js` | Table has 0 rows |
| Appointment from a call | 3 | `appointmentFromCall.js` | Code inserts a row. Table is empty. 3 historical `calls.outcome = appointment_booked` did not leave rows |
| Google Calendar | 3 | `routes/googleCalendar.js` | 0 token rows |
| Reminders | 3 | `jobs/reminderJob.js` | Reads lead metadata, not `appointments`. Needs AiSensy |
| Integrations hub | 2 | `crm/app/integrations/page.tsx`, `routes/integrations.js` | Catalog of 8 webhook sources. 1 integration row |
| Meta Lead Ads | 3 | `routes/metaIntegration.js` | OAuth and webhook exist. POST signature is not checked |
| Google Lead Forms | 3 | webhook catalog key `google_lead_forms` | Generic webhook, not the Google Ads API |
| Outbound AI call | 3 | `startOutboundCall.js`, `pipecat-server/` | 11 completed calls, last 7 June 2026. Current rows are HTTP 502 |
| Call history UI | 2 | `crm/app/calls/page.tsx` | Reads `calls`. Will include the failed mass |
| Scoring and next action | 1 | `leadScore.js`, `nextAction.js`, `backend/tests/conversion.test.js` | 18 tests passed on 10 November 2026 |
| Callback time parse | 1 | `callbackSchedule.js` | Covered by those tests |
| Project auto-assign | 1 | `projectResolver.js` | Covered by those tests |
| Consent / opt-out | 4 | — | No column, no check |
| Call forwarding / transfer | 4 | — | No Telnyx transfer action |
| Live agent handoff UI | 4 | — | Banner only |
| Subscriptions and bundles | 4 | — | No billing table, no Stripe |
| Kanban configuration | 4 | — | Status columns are hardcoded |
| Document knowledge base | 4 | — | No upload, no embeddings |
| Inbound calling | 4 | — | Outbound Call Control only |
| Tasks | 4 | — | No table |
| `callScheduler.js` | 5 | `backend/jobs/callScheduler.js` | Not started by `jobs/index.js` |
| `POST /v1/call/simulate` | 5 | `routes/calls.js` | Still mounted |
| LiveKit / FreeSWITCH docs | 5 | `DOCS/PRODUCT.md`, `TECHNICAL_MANUAL.md`, `AI_CONTEXT.md` | Code header in `server.py` says that stack was replaced |
| Google Sheets dual-write | 5 | CRM env names `GOOGLE_SHEET_ID`, `NEXT_PUBLIC_ENABLE_DUAL_WRITE`, `NEXT_PUBLIC_USE_SUPABASE_PRIMARY` | No references in `*.js` / `*.ts` / `*.tsx`. `crm/lib/data-source.ts` says Sheets were removed |

## Where new UI should attach

Do not add a parallel app. Extend these files:

| Future feature | Attach to |
|---|---|
| Kanban configuration | `crm/app/leads/page.tsx` column list, backed by `tenants.settings` or `projects.settings` jsonb. Status writes already use `PATCH /v1/leads/:leadId` |
| Lead assignment | Lead detail and the existing `assigned_to` PATCH. Team page already lists users via `/v1/users` |
| Notes and timeline | Lead detail. Notes API exists. Activity is `GET /v1/activity` plus metadata history. Prefer one timeline component over a new store |
| Calendar | `crm/app/appointments/page.tsx` and `/v1/appointments/:tenantId`. Google sync already has routes. Token storage must be encrypted before it is turned on |
| Integrations hub | `crm/app/integrations/page.tsx` and `/v1/integrations/:tenantId` |
| Usage | `crm/app/usage/page.tsx` and `/v1/calls/usage/:tenantId`. Enforcement belongs in `startOutboundCall` and `usageTracker.js`, not in a new page |
| Subscriptions | New server checks next to `tenants.plan`. There is no UI to extend except the signup plan step and the usage page. Do not invent a second billing app |
| Call forwarding settings | `crm/app/tenant/page.tsx` settings JSON, only after a Telnyx transfer action exists. It does not |
| Agent handoff | `LeadConversionPanel.tsx` already shows the flag. A transfer control would call a new backend route. There is no route to reuse |
