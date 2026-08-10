-- Phase 5: Provider domain (V4). No secrets in DB — credentials_metadata only.
-- ASCII-only comments (Windows PG client encoding).

-- Global provider catalog (platform-managed)
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  supports_sandbox BOOLEAN NOT NULL DEFAULT TRUE,
  supports_live BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT providers_code_uq UNIQUE (code),
  CONSTRAINT providers_status_chk CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT providers_code_chk CHECK (code ~ '^[a-z][a-z0-9_-]{1,62}$')
);

-- Tenant (or platform) provider account bound to environment
CREATE TABLE IF NOT EXISTS provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id),
  environment TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_accounts_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT provider_accounts_status_chk CHECK (status IN ('ACTIVE', 'DISABLED', 'PENDING')),
  -- Platform-level accounts use organization_id NULL (e.g. shared sandbox)
  CONSTRAINT provider_accounts_org_provider_env_uq UNIQUE NULLS NOT DISTINCT (organization_id, provider_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_org_env
  ON provider_accounts(organization_id, environment, status);

-- At most one default account per org+environment
CREATE UNIQUE INDEX IF NOT EXISTS provider_accounts_default_uq
  ON provider_accounts(organization_id, environment)
  WHERE is_default = TRUE AND organization_id IS NOT NULL;

-- Credential metadata only — secret material lives in env/secret manager
CREATE TABLE IF NOT EXISTS provider_credentials_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  credential_kind TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  rotated_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_credentials_kind_chk CHECK (
    credential_kind IN ('API_KEY', 'WEBHOOK_SECRET', 'OAUTH_CLIENT', 'OTHER')
  ),
  CONSTRAINT provider_credentials_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT provider_credentials_status_chk CHECK (status IN ('ACTIVE', 'REVOKED', 'ROTATING')),
  CONSTRAINT provider_credentials_account_kind_uq UNIQUE (provider_account_id, credential_kind, environment)
);

-- Operational capability matrix with evidence status (DEC-009)
CREATE TABLE IF NOT EXISTS provider_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  capability_code TEXT NOT NULL,
  evidence_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  environment_scope TEXT NOT NULL DEFAULT 'SANDBOX',
  notes TEXT,
  verified_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_capabilities_uq UNIQUE (provider_id, capability_code, environment_scope),
  CONSTRAINT provider_capabilities_evidence_chk CHECK (
    evidence_status IN ('VERIFIED', 'PARTIAL', 'UNSUPPORTED', 'UNKNOWN')
  ),
  CONSTRAINT provider_capabilities_env_chk CHECK (environment_scope IN ('SANDBOX', 'LIVE', 'ANY'))
);

-- Routing rules: org + environment (+ optional currency) -> provider account
CREATE TABLE IF NOT EXISTS provider_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  currency_code CHAR(3) REFERENCES master_currencies(code),
  payment_method_type_code TEXT,
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id),
  priority INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_routes_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT provider_routes_priority_chk CHECK (priority BETWEEN 1 AND 10000)
);

CREATE INDEX IF NOT EXISTS idx_provider_routes_lookup
  ON provider_routes(organization_id, environment, is_active, priority);

-- Provider-side transaction mapping (correlates to payment attempts)
CREATE TABLE IF NOT EXISTS provider_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id),
  provider_account_id UUID NOT NULL REFERENCES provider_accounts(id),
  payment_intent_id UUID REFERENCES payment_intents(id),
  payment_attempt_id UUID REFERENCES payment_attempts(id),
  operation TEXT NOT NULL,
  environment TEXT NOT NULL,
  provider_reference TEXT,
  provider_transaction_id TEXT,
  status TEXT NOT NULL,
  request_idempotency_key TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_transactions_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT provider_transactions_op_chk CHECK (
    operation IN ('AUTHORIZE', 'CAPTURE', 'VOID', 'REFUND', 'STATUS', 'TOKENIZE', 'CHECKOUT_PREPARE', 'WEBHOOK')
  ),
  CONSTRAINT provider_transactions_status_chk CHECK (
    status IN ('SUCCEEDED', 'FAILED', 'PENDING', 'REQUIRES_ACTION', 'NOT_AVAILABLE', 'AMBIGUOUS', 'REJECTED')
  )
);

CREATE INDEX IF NOT EXISTS idx_provider_transactions_org
  ON provider_transactions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_transactions_attempt
  ON provider_transactions(payment_attempt_id)
  WHERE payment_attempt_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS provider_transactions_idem_uq
  ON provider_transactions(organization_id, request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;

-- Seed: internal sandbox provider (TEST ONLY)
INSERT INTO providers (code, name, status, supports_sandbox, supports_live, metadata_json)
VALUES (
  'sandbox',
  'Internal Sandbox Provider',
  'ACTIVE',
  TRUE,
  FALSE,
  '{"test_only": true, "note": "Not a production payment rail"}'::jsonb
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability_code, evidence_status, environment_scope, notes, verified_at)
SELECT p.id, c.capability_code, c.evidence_status, 'SANDBOX', c.notes, NOW()
FROM providers p
CROSS JOIN (
  VALUES
    ('payment.authorize', 'VERIFIED', 'Sandbox authorize via contract tests'),
    ('payment.capture', 'VERIFIED', 'Sandbox capture coalesced into confirmPayment'),
    ('payment.void', 'PARTIAL', 'Sandbox cancel maps to local intent cancel; no remote void'),
    ('payment.refund', 'UNSUPPORTED', 'Refund rail deferred to Financial phase'),
    ('payment.status', 'VERIFIED', 'Sandbox status probe'),
    ('payment.tokenize', 'PARTIAL', 'Opaque token accepted; no card vault'),
    ('webhook.verify', 'VERIFIED', 'Sandbox HMAC webhook verification'),
    ('webhook.normalize', 'VERIFIED', 'Sandbox event normalization')
) AS c(capability_code, evidence_status, notes)
WHERE p.code = 'sandbox'
ON CONFLICT (provider_id, capability_code, environment_scope) DO NOTHING;

-- Platform shared sandbox account (organization_id NULL)
INSERT INTO provider_accounts (organization_id, provider_id, environment, display_name, status, is_default, metadata_json)
SELECT NULL, p.id, 'SANDBOX', 'Platform Sandbox Account', 'ACTIVE', FALSE,
       '{"shared": true, "test_only": true}'::jsonb
FROM providers p
WHERE p.code = 'sandbox'
ON CONFLICT (organization_id, provider_id, environment) DO NOTHING;

INSERT INTO provider_credentials_metadata (
  provider_account_id, organization_id, credential_kind, secret_ref, environment, status, metadata_json
)
SELECT pa.id, NULL, 'WEBHOOK_SECRET', 'SANDBOX_WEBHOOK_SECRET', 'SANDBOX', 'ACTIVE',
       '{"note": "Env-only secret reference; value never stored in PostgreSQL"}'::jsonb
FROM provider_accounts pa
JOIN providers p ON p.id = pa.provider_id
WHERE p.code = 'sandbox' AND pa.organization_id IS NULL AND pa.environment = 'SANDBOX'
ON CONFLICT (provider_account_id, credential_kind, environment) DO NOTHING;
