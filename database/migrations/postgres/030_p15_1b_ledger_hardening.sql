-- P15.1-B: Ledger hardening — unique journal source identity (I4)
-- Additive only. Does not finalize settlements or change payout lifecycle APIs.
--
-- Current schema (025/028/029): ledger_journals has nullable source_type/source_id;
-- app-level SELECT-before-INSERT only (race window). Immutability triggers forbid DELETE.
--
-- Change: partial UNIQUE index on (organization_id, source_type, source_id)
--   WHERE both source fields are non-null.
-- Reason: prevent duplicate financial posting under concurrency (payment, refund,
--   settlement_finalize, payout).
-- Backward compatible: NULL source rows remain allowed for ad-hoc journals.
-- Rollback: DROP INDEX ledger_journals_source_uq;
-- Prerequisite: no duplicate (org, source_type, source_id) rows (checked below).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ledger_journals
    WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    GROUP BY organization_id, source_type, source_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'P15.1-B migration blocked: duplicate ledger_journals (organization_id, source_type, source_id) exist; resolve before unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ledger_journals_source_uq
  ON ledger_journals (organization_id, source_type, source_id)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
