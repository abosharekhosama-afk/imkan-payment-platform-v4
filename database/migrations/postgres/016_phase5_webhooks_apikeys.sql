-- Phase 5: Inbound provider webhooks + V4 API keys (hashed) + rate-limit counters support

-- Inbound webhook events from providers
CREATE TABLE IF NOT EXISTS provider_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  provider_account_id UUID REFERENCES provider_accounts(id),
  organization_id UUID REFERENCES organizations(id),
  provider_event_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_valid BOOLEAN NOT NULL,
  signature_error TEXT,
  payload_hash TEXT NOT NULL,
  raw_body_redacted TEXT,
  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized_event_type TEXT,
  normalized_payload_json JSONB,
  processing_status TEXT NOT NULL DEFAULT 'RECEIVED',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  related_payment_intent_id UUID REFERENCES payment_intents(id),
  related_provider_reference TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_webhook_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT provider_webhook_status_chk CHECK (
    processing_status IN ('RECEIVED', 'REJECTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DUPLICATE')
  ),
  CONSTRAINT provider_webhook_attempts_chk CHECK (attempts >= 0),
  -- Deduplication: same provider event id cannot be processed twice
  CONSTRAINT provider_webhook_provider_event_uq UNIQUE (provider_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_status
  ON provider_webhook_events(processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_provider_webhook_org
  ON provider_webhook_events(organization_id, received_at DESC)
  WHERE organization_id IS NOT NULL;

-- Replay protection window tracking (optional explicit nonce store)
CREATE TABLE IF NOT EXISTS provider_webhook_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  nonce TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT provider_webhook_nonces_uq UNIQUE (provider_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhook_nonces_expiry
  ON provider_webhook_nonces(expires_at);

-- V4 API keys (secret hashed; prefix for display)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  environment TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT api_keys_env_chk CHECK (environment IN ('SANDBOX', 'LIVE')),
  CONSTRAINT api_keys_status_chk CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT api_keys_prefix_uq UNIQUE (key_prefix),
  CONSTRAINT api_keys_hash_uq UNIQUE (key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org_status
  ON api_keys(organization_id, status, environment);

-- Rate limit hit audit (observability; enforcement is in-process in Phase 5)
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  api_key_id UUID REFERENCES api_keys(id),
  bucket TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  limit_value INT NOT NULL,
  window_seconds INT NOT NULL,
  ip TEXT,
  route TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created
  ON rate_limit_events(created_at DESC);
