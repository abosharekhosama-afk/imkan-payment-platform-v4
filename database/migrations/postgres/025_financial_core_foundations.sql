-- P6–P10 foundations: refunds, ledger, settlement, payout, reconciliation, risk, disputes, books

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reason TEXT,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  provider_refund_ref TEXT,
  idempotency_key TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refunds_status_chk CHECK (status IN ('PENDING','SUCCEEDED','FAILED','CANCELLED')),
  CONSTRAINT refunds_env_chk CHECK (environment IN ('SANDBOX','LIVE')),
  CONSTRAINT refunds_amount_positive CHECK (amount_minor > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS refunds_org_idem_uq ON refunds(organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS refunds_org_idx ON refunds(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_pi_idx ON refunds(payment_intent_id);

-- Ledger
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ledger_accounts_type_chk CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  CONSTRAINT ledger_accounts_env_chk CHECK (environment IN ('SANDBOX','LIVE')),
  CONSTRAINT ledger_accounts_org_code_env_uq UNIQUE (organization_id, code, environment, currency_code)
);

CREATE TABLE IF NOT EXISTS ledger_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  memo TEXT,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ledger_journals_env_chk CHECK (environment IN ('SANDBOX','LIVE'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES ledger_journals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id),
  direction TEXT NOT NULL,
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ledger_entries_dir_chk CHECK (direction IN ('DEBIT','CREDIT')),
  CONSTRAINT ledger_entries_amount_positive CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS ledger_entries_org_idx ON ledger_entries(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_id);

-- Settlements / payouts / reconciliation
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency_code CHAR(3) NOT NULL,
  gross_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  fees_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  net_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlements_status_chk CHECK (status IN ('DRAFT','FINALIZED','PAID','CANCELLED')),
  CONSTRAINT settlements_env_chk CHECK (environment IN ('SANDBOX','LIVE'))
);
CREATE TABLE IF NOT EXISTS settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_intent_id UUID REFERENCES payment_intents(id),
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  settlement_id UUID REFERENCES settlements(id),
  payout_account_id UUID REFERENCES payout_accounts(id),
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  status TEXT NOT NULL DEFAULT 'PENDING',
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payouts_status_chk CHECK (status IN ('PENDING','SUBMITTED','PAID','FAILED','CANCELLED')),
  CONSTRAINT payouts_env_chk CHECK (environment IN ('SANDBOX','LIVE')),
  CONSTRAINT payouts_amount_positive CHECK (amount_minor > 0)
);
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL DEFAULT 'SANDBOX',
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  provider_txn_count INT NOT NULL DEFAULT 0,
  payment_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  discrepancy_type TEXT NOT NULL,
  reference TEXT,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Risk / disputes
CREATE TABLE IF NOT EXISTS risk_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_intent_id UUID REFERENCES payment_intents(id),
  signal_type TEXT NOT NULL,
  score NUMERIC(10,2),
  decision TEXT NOT NULL DEFAULT 'ALLOW',
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT risk_signals_decision_chk CHECK (decision IN ('ALLOW','BLOCK','REVIEW'))
);
CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_intent_id UUID REFERENCES payment_intents(id),
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  reason TEXT,
  provider_dispute_ref TEXT,
  evidence_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT disputes_status_chk CHECK (status IN ('OPEN','EVIDENCE_REQUIRED','WON','LOST','CANCELLED'))
);

-- Books sync
CREATE TABLE IF NOT EXISTS books_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id UUID,
  event_type TEXT NOT NULL,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT books_sync_status_chk CHECK (status IN ('PENDING','SYNCED','FAILED','RETRYING'))
);
CREATE INDEX IF NOT EXISTS books_sync_org_idx ON books_sync_state(organization_id, status);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS external_customer_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source_system TEXT;

ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS external_invoice_ref TEXT;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS success_url TEXT;
ALTER TABLE payment_links ADD COLUMN IF NOT EXISTS cancel_url TEXT;
