# Database schema reference

**Verified against the live Supabase project on 10 November 2026.**  
The repo does not contain this schema. `backend/migrations/` has one file, `20260920_lead_context_conversion.sql`, which only adds conversion columns to `lead_context`.

Supabase migration history on the database (names only):

| Version | Name |
|---|---|
| 20260311082153 | create_calls_and_transcripts |
| 20260311082210 | create_integrations_tables |
| 20260427224235 | v2_user_profiles_and_teams |
| 20260427224257 | v2_knowledge_base_and_demo |
| 20260505182148 | v3_calling_stack_upgrade |
| 20260622032619 | cascade_lead_call_child_fks |
| 20260622032701 | standardize_timestamptz |
| 20260622032717 | create_communications_table |
| 20260920142640 | enable_rls_all_public_tables |
| 20260920172144 | lead_context_conversion |

Those migration SQL bodies were not re-read. The catalog below is the live result of `information_schema` and `pg_catalog`, not a reconstruction from the migration names.

## Platform objects

- Extensions: `plpgsql`, `pgcrypto` 1.3, `uuid-ossp` 1.1, `pg_stat_statements` 1.11, `supabase_vault` 0.3.1. No `vector`.
- Public views and materialized views: none.
- Public functions and stored procedures: none.
- Public triggers: none.
- Storage buckets: none.
- RLS: enabled on all 24 `public` tables. `relforcerowsecurity` is false on all of them. `pg_policies` returned no rows. Supabase advisor `rls_enabled_no_policy` lists all 24.
- Grants: `anon`, `authenticated`, and `service_role` each have `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` on all 24 public tables. With RLS on and no policies, `anon` and `authenticated` are denied by default. `service_role` and the table owner bypass RLS.

Columns not listed under "NOT NULL or default" in the catalog query are nullable and have no default. Types below are `udt_name`.

## tenants

Company workspace. Approx. 6 rows.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()`. Signup sets this to the auth user id |
| name | varchar | NOT NULL |
| slug | varchar | NOT NULL, UNIQUE |
| status | varchar | default `active` |
| settings | jsonb | default `{}` |
| created_at | timestamptz | default `now()` |
| onboarding_completed | bool | default false |
| plan | varchar | default `starter`. CHECK in (`starter`,`growth`,`enterprise`) |
| trial_ends_at | timestamptz | nullable, no DB enforcement |
| industry | varchar | |
| address | text | |
| gstin | varchar | |
| admin_user_id | uuid | no FK found |

Indexes: `tenants_pkey`, `tenants_slug_key`, `idx_tenants_slug`, `idx_tenants_status`.

## user_profiles

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | NOT NULL, UNIQUE. Supabase auth user. No FK into `auth.users` was returned |
| tenant_id | uuid | FK → `tenants.id` |
| full_name | varchar | |
| phone | varchar | |
| role | varchar | NOT NULL, default `executive`. CHECK in (`admin`,`manager`,`executive`) |
| position | varchar | |
| is_active | bool | default true |
| created_at, updated_at | timestamptz | default `now()` on created |

Indexes: pkey, `user_profiles_user_id_key`, `idx_user_profiles_tenant_id`.

## teams / team_members

`teams`: id PK, tenant_id NOT NULL FK, name NOT NULL, manager_id FK → `user_profiles.id`, description, timestamps.  
`team_members`: id PK, team_id NOT NULL FK, user_profile_id NOT NULL FK, role NOT NULL default `executive` CHECK in (`manager`,`executive`), joined_at. UNIQUE `(team_id, user_profile_id)`. No `tenant_id` column. Approx. 3 teams, 1 member.

## projects

id PK, tenant_id NOT NULL FK, team_id FK, created_by FK → `user_profiles.id`, name NOT NULL, description, status default `active` CHECK in (`active`,`paused`,`archived`), lead_source, settings jsonb default `{}`, timestamps. Index `idx_projects_tenant_id`. Approx. 3 rows. Used by dial and CRM.

## leads

id PK, tenant_id NOT NULL FK, name NOT NULL, phone NOT NULL, email, inquiry, source, status default `new` (no CHECK), metadata jsonb default `{}`, timestamps, project_id FK, assigned_to FK → `user_profiles.id`. UNIQUE `(tenant_id, phone)`. Indexes on phone, project, `(tenant_id, status)`, created_at. Approx. 18 rows.

Notes, status history, and a communications log also live inside `metadata` (`notes`, `status_history`, `communications_log`). That duplicates the `communications` table.

## lead_context

One row per lead. UNIQUE `lead_id`. FK to leads, tenants, projects. Columns: budget, preferred_location, property_type, timeline, possession_preference, interest_level, objections jsonb default `[]`, callback_time, appointment_interest default false, last_summary, last_outcome, last_contacted_at, previous_interest_level, call_count NOT NULL default 0, timestamps, score, temperature, next_action, next_action_at, human_handoff default false, ai_confidence, score_signals jsonb default `[]`, preferred_product, decision_maker. Approx. 7 rows. Written by `leadIntentExtractor.js` and `newCalls.js`.

## call_queue

id PK, tenant_id NOT NULL, project_id FK, lead_id NOT NULL FK, priority NOT NULL default 5, scheduled_at NOT NULL default now(), status NOT NULL default `queued` (**no CHECK**), attempt_count NOT NULL default 0, last_attempt_at, failure_reason, call_id FK → calls, timestamps. Indexes: `(tenant_id, status, scheduled_at)`, partial index where status in (`queued`,`retry_scheduled`), index on lead_id. Approx. 118,241 rows: 118,239 `failed`, 2 `retry_scheduled`.

## calls

id PK, tenant_id NOT NULL, lead_id NOT NULL, phone NOT NULL, status NOT NULL default `initiating` (no CHECK), outcome, duration_seconds, error_message, started_at, ended_at, timestamps, project_id FK. No Telnyx `call_control_id` column. Exact counts: 118,255 `failed`, 11 `completed`, 1 `initiating`. Failed message is almost entirely `HTTP 502`. Indexes on tenant, lead, project, status, created_at.

## call_transcripts

id PK, call_id NOT NULL UNIQUE FK → calls, full_transcript, summary, created_at NOT NULL. **No tenant_id.** Approx. 11 rows.

## call_events

id PK, call_id NOT NULL FK, event_type NOT NULL, event_data jsonb, created_at NOT NULL. **No tenant_id.** Approx. 11 rows.

## call_analytics

id PK, call_id FK, tenant_id NOT NULL, project_id FK, lead_id FK, ring/talk durations, tool_call_count, barge_in_count, silence_count, filler_phrase_count, pickup_confirmed, appointment_booked, callback_scheduled, outcome, retry_count, failure_reason, call_brief_version default `v3`, created_at NOT NULL. Approx. 4 rows.

## appointments

id PK, tenant_id NOT NULL, lead_id FK, project_id FK, call_id FK, scheduled_at NOT NULL, title, notes, status default `scheduled` CHECK in (`scheduled`,`completed`,`cancelled`,`rescheduled`), google_event_id, google_meet_link, reminder flags default false, timestamps. **0 rows.** Reminder job does not read this table. It reads `leads.metadata`.

## communications

id PK, tenant_id NOT NULL, lead_id FK, channel NOT NULL, direction NOT NULL, subject, message, status, provider, metadata jsonb NOT NULL default `{}`, created_at NOT NULL. Approx. 120 rows. Parallel log also exists in `leads.metadata.communications_log`.

## credentials

id PK, tenant_id NOT NULL FK, service NOT NULL, encrypted_data NOT NULL, is_active default true, created_at. UNIQUE `(tenant_id, service)`. **0 rows.** AES payload is produced by `backend/encryption.js`.

## knowledge_bases / kb_products

`knowledge_bases`: id, tenant_id NOT NULL, project_id FK, type NOT NULL default `tenant` CHECK in (`tenant`,`project`), title, brand_voice, calling_rules, company_instructions, custom_content jsonb, timestamps. **0 rows.** Read by `callContextBuilder.js` when present.

`kb_products`: id, project_id NOT NULL, tenant_id NOT NULL, name NOT NULL, property_type, location, price_range, size, possession_status, amenities, extra_details jsonb, is_active default true, timestamps. Approx. 3 rows. This is the catalog the voice agent searches.

## integrations / integration_sources / integration_logs

`integration_sources` is global: id, key UNIQUE, label, integration_type default `webhook`, description, is_active, created_at. Live keys: generic, google_lead_forms, indiamart, justdial, meta_lead_ads, tally, typeform, zapier.

`integrations`: per tenant, UNIQUE `(tenant_id, integration_key)`. webhook_secret and encrypted_credentials are nullable text. webhook_secret is not encrypted. Approx. 1 row.

`integration_logs`: payload jsonb, lead_id FK, error_message. Approx. 3 rows.

## google_calendar_tokens

UNIQUE `tenant_id`. access_token NOT NULL, refresh_token nullable, both plaintext. **0 rows.**

## tenant_usage

UNIQUE `(tenant_id, month)`. Counters all NOT NULL default 0: calls_attempted, calls_connected, call_minutes_used numeric, demo_calls_used, failed_calls, no_answer_calls, ai token estimates, whatsapp_messages_sent, emails_sent, appointments_booked, callbacks_scheduled. Approx. 9 rows. `usageTracker.js` increments them. Nothing reads them to refuse work.

## activity_logs

id, tenant_id FK, project_id FK, user_id (no FK), action_type NOT NULL, entity_type, entity_id, metadata default `{}`, created_at. Approx. 8 rows.

## demo_requests

No tenant_id. name, whatsapp_number NOT NULL, status default `pending` CHECK in (`pending`,`calling`,`completed`,`failed`), flags, error_log, ip_address. Approx. 3 rows.

## Use classification

| Table | Use |
|---|---|
| tenants, user_profiles, leads, projects, calls, call_queue, lead_context, kb_products, tenant_usage, communications, integration_sources | Used by current code and have or had rows |
| teams, team_members, integrations, integration_logs, activity_logs, call_transcripts, call_events, call_analytics, demo_requests | Used by current code, thin data |
| appointments, credentials, knowledge_bases, google_calendar_tokens | Written by current code paths, zero rows |
| None of the 24 are an abandoned duplicate table | `communications` and `leads.metadata.communications_log` are two stores for the same idea. `appointments.reminder_*` and `leads.metadata.reminder_*` are two reminder models. The job uses metadata |

No table should be dropped because the frontend rarely mentions it. `call_events` and `call_analytics` are written from the voice path.
