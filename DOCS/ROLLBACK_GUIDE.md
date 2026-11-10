# Rollback

Use this for the 10 November 2026 Phase 0 change. Do not drop tables while the new backend is running.

## Application

Redeploy the previous backend commit `cc15cd7`. That build dials from the queue again and returns decrypted credentials. Prefer leaving the new build deployed with `CALL_QUEUE_ENABLED` and `DEMO_CALLS_ENABLED` unset.

## Database privileges

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

This restores the grants the audit called dangerous. Run it only to recover a client that was using the Data API directly. The CRM does not.

## New objects

`channel_consent`, `communication_suppressions`, and `usage_ledger` can stay. Dropping them is written as comments in `backend/migrations/20261110_phase0_security_consent_usage.sql`. That deletes consent and usage history.

## Voice VM

No VM change was made. Do not restart or stop the poller from this repository. After the new backend is deployed, the poller receives `CALL_QUEUE_ENABLED is not true` and does not dial.
