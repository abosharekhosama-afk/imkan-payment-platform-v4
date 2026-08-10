-- Phase 3: Bank / payout accounts (spec §7).
-- Three separated state models:
--   1. payout_accounts.status            = account lifecycle
--   2. payout_account_verifications      = verification case state machine
--   3. payout_account_verification_results = append-only attempts/checks
-- Sensitive data model (layered):
--   account_number_encrypted (AES-256-GCM, key from env only)
--   account_last4            (masked display)
--   account_fingerprint      (HMAC-SHA256, deterministic duplicate detection, non-reversible)
-- Encryption/HMAC keys are NEVER stored in PostgreSQL.

CREATE TABLE IF NOT EXISTS payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payout_method_id UUID NOT NULL REFERENCES master_payout_methods(id),
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  country_id UUID NOT NULL REFERENCES master_countries(id),
  bank_name TEXT NOT NULL,
  account_holder_name TEXT NOT NULL,
  holder_relationship TEXT NOT NULL DEFAULT 'COMPANY',
  account_type TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  account_last4 TEXT NOT NULL,
  account_fingerprint TEXT NOT NULL,
  swift_bic TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_accounts_holder_chk CHECK (holder_relationship IN ('COMPANY', 'OWNER', 'OTHER')),
  CONSTRAINT payout_accounts_type_chk CHECK (account_type IN ('IBAN', 'ACCOUNT_NUMBER')),
  CONSTRAINT payout_accounts_status_chk CHECK (
    status IN ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'REJECTED', 'DEACTIVATED')
  ),
  -- Duplicate detection within tenant (deterministic fingerprint).
  CONSTRAINT payout_accounts_org_fp_uq UNIQUE (organization_id, account_fingerprint)
);

-- Cross-tenant duplicate lookups for risk review (non-unique).
CREATE INDEX IF NOT EXISTS idx_payout_accounts_fp ON payout_accounts(account_fingerprint);
CREATE INDEX IF NOT EXISTS idx_payout_accounts_org_status ON payout_accounts(organization_id, status);

-- At most one default payout account per organization.
CREATE UNIQUE INDEX IF NOT EXISTS payout_accounts_default_uq
  ON payout_accounts (organization_id)
  WHERE is_default;

-- Verification case (separate from account lifecycle).
CREATE TABLE IF NOT EXISTS payout_account_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_account_id UUID NOT NULL REFERENCES payout_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  status TEXT NOT NULL DEFAULT 'PENDING',
  initiated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  details_json JSONB,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT payout_verifications_method_chk CHECK (method IN ('MANUAL_REVIEW', 'DOCUMENT', 'PROVIDER')),
  CONSTRAINT payout_verifications_status_chk CHECK (
    status IN ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'CANCELLED')
  )
);

-- One open verification case per account.
CREATE UNIQUE INDEX IF NOT EXISTS payout_verifications_open_uq
  ON payout_account_verifications (payout_account_id)
  WHERE status IN ('PENDING', 'IN_PROGRESS');

CREATE INDEX IF NOT EXISTS idx_payout_verifications_org ON payout_account_verifications(organization_id, status);

-- Append-only verification attempts/checks.
CREATE TABLE IF NOT EXISTS payout_account_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES payout_account_verifications(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  result TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'internal',
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_verification_results_chk CHECK (
    result IN ('PASS', 'FAIL', 'WARN', 'PENDING', 'NOT_AVAILABLE')
  )
);

CREATE INDEX IF NOT EXISTS idx_payout_verification_results_v ON payout_account_verification_results(verification_id, created_at);

DROP TRIGGER IF EXISTS trg_payout_verification_results_append_only ON payout_account_verification_results;
CREATE TRIGGER trg_payout_verification_results_append_only
  BEFORE UPDATE OR DELETE ON payout_account_verification_results
  FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();

-- Append-only account lifecycle transition history.
CREATE TABLE IF NOT EXISTS payout_account_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_account_id UUID NOT NULL REFERENCES payout_accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payout_account_transitions_actor_chk CHECK (actor_type IN ('MERCHANT', 'PLATFORM', 'SYSTEM'))
);

CREATE INDEX IF NOT EXISTS idx_payout_account_transitions ON payout_account_transitions(payout_account_id, created_at);

DROP TRIGGER IF EXISTS trg_payout_account_transitions_append_only ON payout_account_transitions;
CREATE TRIGGER trg_payout_account_transitions_append_only
  BEFORE UPDATE OR DELETE ON payout_account_transitions
  FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();
