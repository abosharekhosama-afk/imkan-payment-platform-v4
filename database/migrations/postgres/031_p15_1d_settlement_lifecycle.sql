-- P15.1-D: Settlement lifecycle metadata (finalize / cancel audit)
-- Additive only. Does not change payout lifecycle (P15.1-E).
--
-- Current schema: settlements.status DRAFT|FINALIZED|PAID|CANCELLED; no finalized_at.
-- Change: finalized_at/by, cancelled_at/by columns.
-- Reason: immutable FINALIZED audit trail; cancel attribution.
-- Backward compatible: NULL for historical rows.
-- Rollback: DROP columns (metadata loss only).

ALTER TABLE settlements ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS settlements_org_status_idx
  ON settlements (organization_id, environment, status, currency_code);
