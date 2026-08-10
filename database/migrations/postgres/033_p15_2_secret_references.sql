-- P15.2: secret reference metadata (no secret values in PostgreSQL)
-- Values live in SECRET_BACKEND (env | file | kms). This table tracks refs + rotation.

CREATE TABLE IF NOT EXISTS secret_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN (
    'provider_api_key',
    'webhook_secret',
    'bank_payout_credential',
    'oauth_client_secret',
    'encryption_key',
    'other'
  )),
  secret_ref TEXT NOT NULL,
  backend TEXT NOT NULL DEFAULT 'env' CHECK (backend IN ('env', 'file', 'kms')),
  version TEXT NULL,
  provider_code TEXT NULL,
  environment TEXT NULL CHECK (environment IS NULL OR environment IN ('SANDBOX', 'LIVE')),
  rotated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT secret_references_ref_format CHECK (secret_ref ~ '^[A-Z][A-Z0-9_]*$')
);

CREATE UNIQUE INDEX IF NOT EXISTS secret_references_global_uq
  ON secret_references (purpose, secret_ref)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS secret_references_org_uq
  ON secret_references (organization_id, purpose, secret_ref)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS secret_references_org_idx ON secret_references (organization_id);
CREATE INDEX IF NOT EXISTS secret_references_ref_idx ON secret_references (secret_ref);

COMMENT ON TABLE secret_references IS 'P15.2 metadata only — secret values never stored here';
