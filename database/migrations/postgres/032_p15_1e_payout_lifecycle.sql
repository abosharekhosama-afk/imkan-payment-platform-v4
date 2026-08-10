-- P15.1-E: Payout lifecycle metadata (sandbox/internal rail)
-- Additive only. No live payout provider integration.
--
-- Current schema (025): payouts without submitted_at/paid_at/failure_reason.
-- Change: lifecycle timestamps + failure_reason column.
-- Reason: P15.1-E sandbox state machine audit trail.
-- Backward compatible: NULL on historical rows.
-- Rollback: DROP columns.

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS payouts_settlement_status_idx
  ON payouts (settlement_id, organization_id, status);
