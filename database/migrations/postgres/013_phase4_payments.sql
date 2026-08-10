-- Phase 4: Payment Core, Payment Links, Merchant Branding, Checkout Sessions
-- DEC-001: amounts NUMERIC(30,0) minor units + CHAR(3) currency FK -> master_currencies(code)
-- Chain: Organization -> Merchant Profile -> Payment Link -> Session -> Attempt -> Transaction -> Provider
-- No PAN/CVV columns. No provider credentials stored.

-- ---------------------------------------------------------------------------
-- Merchant payment config / branding (one per organization)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merchant_payment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id) ON DELETE CASCADE,
  company_display_name TEXT,
  logo_url TEXT,
  brand_primary_color TEXT,
  brand_secondary_color TEXT,
  description TEXT,
  support_email TEXT,
  support_phone TEXT,
  checkout_theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_success_url TEXT,
  default_cancel_url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_payment_config_org_uq UNIQUE (organization_id),
  CONSTRAINT merchant_payment_config_color_primary_chk CHECK (
    brand_primary_color IS NULL OR brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT merchant_payment_config_color_secondary_chk CHECK (
    brand_secondary_color IS NULL OR brand_secondary_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_merchant_payment_config_profile
  ON merchant_payment_config(merchant_profile_id);

-- ---------------------------------------------------------------------------
-- Payment Links
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
  public_token TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount_mode TEXT NOT NULL,
  amount_minor NUMERIC(30,0),
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  expires_at TIMESTAMPTZ,
  max_uses INT,
  use_count INT NOT NULL DEFAULT 0,
  one_time BOOLEAN NOT NULL DEFAULT FALSE,
  reusable BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INT NOT NULL DEFAULT 1,
  created_by_user_id UUID REFERENCES users(id),
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_links_token_uq UNIQUE (public_token),
  CONSTRAINT payment_links_amount_mode_chk CHECK (amount_mode IN ('FIXED', 'CUSTOMER_ENTERED')),
  CONSTRAINT payment_links_status_chk CHECK (
    status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED')
  ),
  CONSTRAINT payment_links_amount_chk CHECK (
    (amount_mode = 'FIXED' AND amount_minor IS NOT NULL AND amount_minor > 0)
    OR (amount_mode = 'CUSTOMER_ENTERED' AND (amount_minor IS NULL OR amount_minor > 0))
  ),
  CONSTRAINT payment_links_max_uses_chk CHECK (max_uses IS NULL OR max_uses >= 1),
  CONSTRAINT payment_links_use_count_chk CHECK (use_count >= 0),
  CONSTRAINT payment_links_one_time_chk CHECK (
    NOT one_time OR max_uses IS NULL OR max_uses = 1
  ),
  CONSTRAINT payment_links_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_payment_links_org_status
  ON payment_links(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_links_org_reference
  ON payment_links(organization_id, reference)
  WHERE reference IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Payment Orders (commercial reference grouping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
  payment_link_id UUID REFERENCES payment_links(id),
  order_number TEXT,
  description TEXT,
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_orders_amount_chk CHECK (amount_minor > 0),
  CONSTRAINT payment_orders_status_chk CHECK (
    status IN ('OPEN', 'PAID', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT payment_orders_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_org
  ON payment_orders(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_orders_link
  ON payment_orders(payment_link_id)
  WHERE payment_link_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Payment Intents (primary state machine)
-- States: CREATED -> REQUIRES_PAYMENT -> PROCESSING -> SUCCEEDED
--         PROCESSING -> FAILED
--         CREATED|REQUIRES_PAYMENT -> CANCELLED|EXPIRED
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
  payment_link_id UUID REFERENCES payment_links(id),
  payment_order_id UUID REFERENCES payment_orders(id),
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  status TEXT NOT NULL DEFAULT 'CREATED',
  version INT NOT NULL DEFAULT 1,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  description TEXT,
  reference TEXT,
  success_url TEXT,
  cancel_url TEXT,
  expires_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_code TEXT,
  failure_message TEXT,
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_intents_amount_chk CHECK (amount_minor > 0),
  CONSTRAINT payment_intents_status_chk CHECK (
    status IN ('CREATED', 'REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT payment_intents_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_org_status
  ON payment_intents(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_link
  ON payment_intents(payment_link_id)
  WHERE payment_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_intents_order
  ON payment_intents(payment_order_id)
  WHERE payment_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_intent_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  actor_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_intent_transitions_actor_chk CHECK (
    actor_type IN ('MERCHANT', 'CUSTOMER', 'SYSTEM', 'PROVIDER')
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_intent_transitions_intent
  ON payment_intent_transitions(payment_intent_id, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_intent_transitions_append_only'
  ) THEN
    CREATE TRIGGER trg_payment_intent_transitions_append_only
      BEFORE UPDATE OR DELETE ON payment_intent_transitions
      FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Payment Sessions (checkout session bound to link + intent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
  payment_link_id UUID NOT NULL REFERENCES payment_links(id),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  payment_order_id UUID REFERENCES payment_orders(id),
  public_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  version INT NOT NULL DEFAULT 1,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  success_url TEXT,
  cancel_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_sessions_token_uq UNIQUE (public_token),
  CONSTRAINT payment_sessions_status_chk CHECK (
    status IN ('OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED')
  ),
  CONSTRAINT payment_sessions_amount_chk CHECK (amount_minor > 0),
  CONSTRAINT payment_sessions_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_org
  ON payment_sessions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_intent
  ON payment_sessions(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_link
  ON payment_sessions(payment_link_id);

-- One OPEN session per intent (concurrency / duplicate-session guard)
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_open_intent_uq
  ON payment_sessions(payment_intent_id)
  WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------
-- Payment Attempts (provider tries; no card data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_session_id UUID NOT NULL REFERENCES payment_sessions(id),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  attempt_number INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  version INT NOT NULL DEFAULT 1,
  provider_code TEXT NOT NULL,
  provider_reference TEXT,
  payment_method_type_code TEXT,
  failure_code TEXT,
  failure_message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_attempts_status_chk CHECK (
    status IN ('CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED')
  ),
  CONSTRAINT payment_attempts_number_chk CHECK (attempt_number >= 1),
  CONSTRAINT payment_attempts_intent_number_uq UNIQUE (payment_intent_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_session
  ON payment_attempts(payment_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_intent
  ON payment_attempts(payment_intent_id, attempt_number);

-- At most one in-flight attempt per intent
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_inflight_intent_uq
  ON payment_attempts(payment_intent_id)
  WHERE status IN ('CREATED', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- Payment Transactions (recorded provider outcome / payment record)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_profile_id UUID NOT NULL REFERENCES merchant_profiles(id),
  payment_link_id UUID REFERENCES payment_links(id),
  payment_order_id UUID REFERENCES payment_orders(id),
  payment_session_id UUID NOT NULL REFERENCES payment_sessions(id),
  payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
  payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id),
  amount_minor NUMERIC(30,0) NOT NULL,
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  status TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  provider_transaction_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  description TEXT,
  reference TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_transactions_amount_chk CHECK (amount_minor > 0),
  CONSTRAINT payment_transactions_status_chk CHECK (
    status IN ('SUCCEEDED', 'FAILED')
  ),
  CONSTRAINT payment_transactions_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payment_transactions_attempt_uq UNIQUE (payment_attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_org
  ON payment_transactions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_intent
  ON payment_transactions(payment_intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_success_intent_uq
  ON payment_transactions(payment_intent_id)
  WHERE status = 'SUCCEEDED';
