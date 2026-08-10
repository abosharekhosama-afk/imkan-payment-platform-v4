-- Phase 6: Subscriptions + Invoices + collection attempts (DEC-007)
-- ASCII-only comments.

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  price_id UUID NOT NULL REFERENCES prices(id),
  status TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  trial_days INT NOT NULL DEFAULT 0,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  next_billing_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  grace_until TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  payment_method_token TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_status_chk CHECK (
    status IN ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'UNPAID', 'EXPIRED')
  ),
  CONSTRAINT subscriptions_trial_chk CHECK (trial_days >= 0),
  CONSTRAINT subscriptions_retry_chk CHECK (retry_count >= 0 AND retry_count <= 3),
  CONSTRAINT subscriptions_period_chk CHECK (current_period_end > current_period_start)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_org_status
  ON subscriptions(organization_id, status, next_billing_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_due
  ON subscriptions(next_billing_at, status)
  WHERE next_billing_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
  ON subscriptions(customer_id);

CREATE TABLE IF NOT EXISTS subscription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  price_id UUID NOT NULL REFERENCES prices(id),
  quantity INT NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_items_qty_chk CHECK (quantity >= 1)
);

CREATE INDEX IF NOT EXISTS idx_subscription_items_sub
  ON subscription_items(subscription_id);

CREATE TABLE IF NOT EXISTS subscription_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_transitions_actor_chk CHECK (
    actor_type IN ('MERCHANT', 'CUSTOMER', 'SYSTEM', 'PROVIDER')
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_transitions_sub
  ON subscription_transitions(subscription_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_subscription_transitions_append_only'
  ) THEN
    CREATE TRIGGER trg_subscription_transitions_append_only
      BEFORE UPDATE OR DELETE ON subscription_transitions
      FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  subscription_id UUID REFERENCES subscriptions(id),
  payment_intent_id UUID REFERENCES payment_intents(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  subtotal_minor NUMERIC(30,0) NOT NULL,
  tax_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  total_minor NUMERIC(30,0) NOT NULL,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  collection_attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_status_chk CHECK (
    status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE', 'UNCOLLECTIBLE')
  ),
  CONSTRAINT invoices_amounts_chk CHECK (
    subtotal_minor >= 0 AND tax_minor >= 0 AND total_minor > 0
    AND total_minor = subtotal_minor + tax_minor
  ),
  CONSTRAINT invoices_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT invoices_attempts_chk CHECK (collection_attempt_count >= 0 AND collection_attempt_count <= 3),
  CONSTRAINT invoices_org_number_uq UNIQUE (organization_id, number)
);

-- Exactly one renewal invoice per subscription billing period
CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_period_uq
  ON invoices (subscription_id, period_start, period_end)
  WHERE subscription_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL
    AND status <> 'VOID';

CREATE INDEX IF NOT EXISTS idx_invoices_org_status
  ON invoices(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription
  ON invoices(subscription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  price_id UUID REFERENCES prices(id),
  description TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_amount_minor NUMERIC(30,0) NOT NULL,
  amount_minor NUMERIC(30,0) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoice_items_qty_chk CHECK (quantity >= 1),
  CONSTRAINT invoice_items_amount_chk CHECK (unit_amount_minor >= 0 AND amount_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
  ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS billing_collection_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id),
  payment_intent_id UUID REFERENCES payment_intents(id),
  attempt_number INT NOT NULL,
  status TEXT NOT NULL,
  provider_code TEXT,
  provider_reference TEXT,
  provider_transaction_id TEXT,
  failure_code TEXT,
  failure_message TEXT,
  query_before_retry BOOLEAN NOT NULL DEFAULT FALSE,
  request_idempotency_key TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_collection_attempt_num_chk CHECK (attempt_number BETWEEN 1 AND 3),
  CONSTRAINT billing_collection_status_chk CHECK (
    status IN ('SUCCEEDED', 'FAILED', 'AMBIGUOUS', 'REQUIRES_ACTION')
  ),
  CONSTRAINT billing_collection_invoice_attempt_uq UNIQUE (invoice_id, attempt_number),
  CONSTRAINT billing_collection_idem_uq UNIQUE (organization_id, request_idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_collection_invoice
  ON billing_collection_attempts(invoice_id, created_at DESC);
