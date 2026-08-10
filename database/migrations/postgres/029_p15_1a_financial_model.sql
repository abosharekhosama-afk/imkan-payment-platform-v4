-- P15.1-A: Financial model foundations (DEC-008)
-- Additive only. Does not finalize settlements or post ledger (P15.1-B/D).
--
-- Current schema (025): settlements.fees_minor (aggregate), no fee schedules,
-- settlement_lines without eligibility breakdown, no anti-double-inclusion unique.
--
-- Change: fee_schedules + fee_schedule_lines; settlement fee breakdown columns;
-- settlement_line eligibility columns; unique active PI inclusion.
-- Reason: replace hard-coded fees=0 with deterministic platform fee model;
-- eligibility = captured - succeeded/pending refunds; prevent double settlement.
-- Backward compatible: fees_minor remains (= provider + platform); new cols default 0.
-- Rollback: DROP new tables/indexes/columns (data loss of schedules only).

-- ---------------------------------------------------------------------------
-- Fee schedules (org-scoped; master_fee_types remain labels)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  currency_code CHAR(3) NOT NULL,
  fee_type_code TEXT NOT NULL DEFAULT 'PROCESSING',
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fee_schedules_env_chk CHECK (environment IN ('SANDBOX','LIVE')),
  CONSTRAINT fee_schedules_period_chk CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS fee_schedules_lookup_idx
  ON fee_schedules (organization_id, environment, currency_code, fee_type_code, is_active, effective_from DESC);

CREATE TABLE IF NOT EXISTS fee_schedule_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_schedule_id UUID NOT NULL REFERENCES fee_schedules(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  basis_points INT NOT NULL DEFAULT 0,
  fixed_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fee_schedule_lines_bps_chk CHECK (basis_points >= 0 AND basis_points <= 100000),
  CONSTRAINT fee_schedule_lines_fixed_chk CHECK (fixed_minor >= 0)
);

CREATE INDEX IF NOT EXISTS fee_schedule_lines_schedule_idx ON fee_schedule_lines (fee_schedule_id);

-- ---------------------------------------------------------------------------
-- Settlement fee / reserve / adjustment breakdown (DEC-008.1 / .3)
-- fees_minor kept as provider_fees_minor + platform_fees_minor for older readers
-- ---------------------------------------------------------------------------
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS provider_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS platform_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS reserves_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS adjustments_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS fee_schedule_id UUID REFERENCES fee_schedules(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_provider_fees_nonneg'
  ) THEN
    ALTER TABLE settlements ADD CONSTRAINT settlements_provider_fees_nonneg CHECK (provider_fees_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_platform_fees_nonneg'
  ) THEN
    ALTER TABLE settlements ADD CONSTRAINT settlements_platform_fees_nonneg CHECK (platform_fees_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_reserves_nonneg'
  ) THEN
    ALTER TABLE settlements ADD CONSTRAINT settlements_reserves_nonneg CHECK (reserves_minor >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Settlement line eligibility breakdown
-- ---------------------------------------------------------------------------
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS gross_minor NUMERIC(30,0);
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS refunded_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS net_minor NUMERIC(30,0);
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS inclusion_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE settlement_lines
SET gross_minor = amount_minor,
    net_minor = amount_minor - COALESCE(refunded_minor, 0)
WHERE gross_minor IS NULL;

ALTER TABLE settlement_lines ALTER COLUMN gross_minor SET NOT NULL;
ALTER TABLE settlement_lines ALTER COLUMN net_minor SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlement_lines_amounts_nonneg'
  ) THEN
    ALTER TABLE settlement_lines ADD CONSTRAINT settlement_lines_amounts_nonneg
      CHECK (gross_minor >= 0 AND refunded_minor >= 0 AND net_minor >= 0 AND refunded_minor <= gross_minor);
  END IF;
END $$;

-- One active inclusion per payment intent (prevents double settlement)
CREATE UNIQUE INDEX IF NOT EXISTS settlement_lines_pi_active_uq
  ON settlement_lines (payment_intent_id)
  WHERE inclusion_active = TRUE AND payment_intent_id IS NOT NULL;
