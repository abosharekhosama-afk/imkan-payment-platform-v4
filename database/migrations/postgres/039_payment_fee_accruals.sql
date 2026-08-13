-- P17.1 — Per-payment fee accrual (Zoho Payments / DEC-008)
-- Records platform + provider fees and net at capture time.

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS provider_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS platform_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS net_to_merchant_minor NUMERIC(30,0);
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS fee_schedule_id UUID REFERENCES fee_schedules(id) ON DELETE SET NULL;
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS fees_accrued_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_env_chk') THEN
    ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_env_chk
      CHECK (environment IN ('SANDBOX', 'LIVE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_intents_fees_nonneg') THEN
    ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_fees_nonneg
      CHECK (provider_fees_minor >= 0 AND platform_fees_minor >= 0);
  END IF;
END $$;

UPDATE payment_intents
SET net_to_merchant_minor = amount_minor - COALESCE(provider_fees_minor, 0) - COALESCE(platform_fees_minor, 0)
WHERE net_to_merchant_minor IS NULL;

ALTER TABLE payment_intents ALTER COLUMN net_to_merchant_minor SET DEFAULT 0;
UPDATE payment_intents SET net_to_merchant_minor = 0 WHERE net_to_merchant_minor IS NULL;
ALTER TABLE payment_intents ALTER COLUMN net_to_merchant_minor SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_org_env_status
  ON payment_intents (organization_id, environment, status, created_at DESC);

-- Settlement line fee breakdown
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS platform_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS provider_fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0;
ALTER TABLE settlement_lines ADD COLUMN IF NOT EXISTS net_after_fees_minor NUMERIC(30,0);

UPDATE settlement_lines sl
SET platform_fees_minor = COALESCE(pi.platform_fees_minor, 0),
    provider_fees_minor = COALESCE(pi.provider_fees_minor, 0),
    net_after_fees_minor = COALESCE(pi.net_to_merchant_minor, sl.net_minor)
FROM payment_intents pi
WHERE sl.payment_intent_id = pi.id AND sl.net_after_fees_minor IS NULL;

UPDATE settlement_lines
SET net_after_fees_minor = net_minor
WHERE net_after_fees_minor IS NULL;

ALTER TABLE settlement_lines ALTER COLUMN net_after_fees_minor SET NOT NULL;

-- Typed settlement adjustments (chargebacks, reserves, manual credits)
CREATE TABLE IF NOT EXISTS settlement_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  adjustment_type TEXT NOT NULL,
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  reason TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlement_adjustments_type_chk CHECK (
    adjustment_type IN (
      'CHARGEBACK', 'RESERVE_HOLD', 'RESERVE_RELEASE', 'MANUAL_CREDIT',
      'MANUAL_DEBIT', 'PROVIDER_FEE_TRUEUP', 'OTHER'
    )
  )
);

CREATE INDEX IF NOT EXISTS settlement_adjustments_settlement_idx
  ON settlement_adjustments (settlement_id, organization_id);

-- Per-org merchant provider credentials (Sprint 2 foundation)
CREATE TABLE IF NOT EXISTS merchant_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credential_kind TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_provider_credentials_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT merchant_provider_credentials_status_chk CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT merchant_provider_credentials_kind_uq UNIQUE (provider_account_id, credential_kind, environment)
);

CREATE INDEX IF NOT EXISTS merchant_provider_credentials_org_idx
  ON merchant_provider_credentials (organization_id, environment);

-- Palestine BOP provider seed (DISCOVERED — sandbox only until certified)
INSERT INTO providers (code, name, status, supports_sandbox, supports_live, metadata_json)
VALUES (
  'bop',
  'Bank of Palestine Gateway',
  'ACTIVE',
  FALSE,
  FALSE,
  '{"region": "PS", "currency_default": "ILS", "integration": "HPP", "status": "DISCOVERED"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();
