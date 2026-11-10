-- Purpose: Phase 0 foundations that do not rewrite existing rows.
-- Adds consent, suppression, a usage ledger, and queue lease columns.
-- Revokes anonymous and authenticated table privileges. The Express API
-- connects as the table owner and is unchanged. service_role is unchanged.
--
-- Compatibility: new columns are nullable or defaulted. Existing reads of
-- leads, calls, and call_queue keep working. Automatic dialing still requires
-- CALL_QUEUE_ENABLED=true and does not start because of this migration.
--
-- Rollback:
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   ALTER TABLE leads DROP COLUMN IF EXISTS channel_consent;
--   ALTER TABLE call_queue DROP COLUMN IF EXISTS claimed_at, DROP COLUMN IF EXISTS lease_expires_at;
--   ALTER TABLE calls DROP COLUMN IF EXISTS provider, DROP COLUMN IF EXISTS provider_call_id;
--   DROP TABLE IF EXISTS usage_ledger;
--   DROP TABLE IF EXISTS communication_suppressions;
--   DROP INDEX IF EXISTS call_queue_one_open_job;
--
-- Validation:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'leads' AND column_name = 'channel_consent';
--   SELECT COUNT(*) FROM information_schema.role_table_grants
--    WHERE grantee = 'anon' AND privilege_type = 'TRUNCATE' AND table_schema = 'public';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS channel_consent jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE call_queue
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_call_id text;

CREATE INDEX IF NOT EXISTS calls_provider_call_id_idx
  ON calls (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS call_queue_one_open_job
  ON call_queue (lead_id)
  WHERE status IN ('queued', 'retry_scheduled', 'processing', 'calling');

CREATE TABLE IF NOT EXISTS communication_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('call', 'email', 'whatsapp')),
  address text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel, address)
);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  meter text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL,
  status text NOT NULL DEFAULT 'recorded',
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS usage_ledger_tenant_time
  ON usage_ledger (tenant_id, occurred_at DESC);

ALTER TABLE communication_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
