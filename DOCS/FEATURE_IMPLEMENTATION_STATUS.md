# Feature implementation status

Updated 11 November 2026 after the CRM foundation pass. Status follows the product rule: `[x]` means tested end to end in the deployed product. Nothing in this pass is `[x]`.

## Phase A — CRM foundations

| Item | Status | Where |
|---|---|---|
| Dashboard date range | [~] | `GET /v1/analytics/dashboard`, `crm/app/api/stats/route.ts`, `crm/app/page.tsx`. Range is India Standard Time. Lead, call, appointment, source, and team totals come from the database. Charts use the same range. |
| CSV and PNG chart export | [~] | Existing buttons in `DashboardAnalyticsCharts.tsx` export the chart currently on screen. |
| Lead search, filters, sort, pagination | [~] | `crm/app/leads/page.tsx`. Filtering still runs on the loaded tenant list. |
| Kanban editor | [~] | `crm/app/components/KanbanEditor.tsx`, `PUT /v1/tenant/:tenantId/lead-statuses`. Create, rename, color, reorder, default, and deactivate. Deactivated statuses do not delete leads. Unmatched leads stay in Other. |
| Claim | [~] | `POST /v1/leads/:leadId/claim`. The update only succeeds when `assigned_to` is null. |
| Activity timeline | [~] | `GET /v1/leads/:tenantId/:leadId/timeline`, `crm/app/components/LeadTimeline.tsx`. |
| CSV import | [~] | `backend/services/csvParse.js`, `POST /v1/leads/import`. Quoted commas and newlines are kept. Existing phones are reported and not merged. Import does not enqueue a call. |
| Assignment visibility | [~] | Existing list and detail filters. Not exercised with two live users. |

Backend tests: `node --test tests/*.test.js` — 43 passed. CRM `tsc --noEmit` passed. The signed-in CRM was not clicked.

## Phase B started

Google Calendar tokens are encrypted before insert and decrypted only on the server. OAuth state is HMAC-signed and expires in 10 minutes. Calendar routes use the session tenant. No Google account was connected.

## Not started in this pass

Human call transfer, MSG91 live configuration screens, native Google Ads, usage quotas, Stripe, least-privilege database role, and CI. Automatic calling and demo calls stay off. No production migration was added.
