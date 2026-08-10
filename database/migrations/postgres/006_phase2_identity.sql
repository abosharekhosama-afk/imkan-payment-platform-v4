-- Phase 2: Identity depth — email verify, password reset, invitations, error reports, idempotency null-org support

ALTER TABLE idempotency_keys ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_org_key_uq;
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_org_key_uq
  ON idempotency_keys (organization_id, idem_key) NULLS NOT DISTINCT;

ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_events_org_idem_uq;
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_org_idem_uq
  ON outbox_events (organization_id, idempotency_key) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_verification_tokens_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT password_reset_tokens_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role_code TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_invitations_status_chk CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT organization_invitations_token_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_org_invitations_org ON organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_invitations_email ON organization_invitations(organization_id, email_normalized);

CREATE TABLE IF NOT EXISTS step_up_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'SENSITIVE',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT step_up_tokens_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_step_up_user ON step_up_tokens(user_id);

CREATE TABLE IF NOT EXISTS error_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  request_id TEXT,
  method TEXT,
  route TEXT,
  status_code INT,
  error_code TEXT,
  message TEXT,
  ip TEXT,
  user_agent TEXT,
  query_json JSONB,
  params_json JSONB,
  body_json JSONB,
  headers_json JSONB,
  stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_reports_org_created ON error_reports(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_reports_request ON error_reports(request_id);

-- Optional device/session metadata expansion
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS device_label TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
