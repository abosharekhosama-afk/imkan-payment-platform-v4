-- Phase 3 fix (documented regression found by Phase 3 tests):
-- 006 created outbox_events_org_idem_uq with NULLS NOT DISTINCT, which limits each
-- organization to a single outbox event WITHOUT an idempotency key. Events that
-- intentionally carry no key (e.g. kyb.case.needs_information,
-- bank_account.status_changed) must be unlimited.
-- Replace with a partial unique index: uniqueness applies only when a key is present.
-- (006 itself is NOT modified; this is a forward migration.)

-- NULLS NOT DISTINCT is retained so organization_id NULL (platform-level events)
-- still deduplicates on the same key; the WHERE clause exempts keyless events.
DROP INDEX IF EXISTS outbox_events_org_idem_uq;
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_org_idem_uq
  ON outbox_events (organization_id, idempotency_key) NULLS NOT DISTINCT
  WHERE idempotency_key IS NOT NULL;
