-- Platform team accounts (separate from merchant organizations).
-- Platform users have NO merchant organization and NO KYB; they hold PLATFORM_* roles (organization_id = NULL).

CREATE TABLE IF NOT EXISTS platform_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  role_code TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_invitations_status_chk CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT platform_invitations_role_chk CHECK (role_code IN ('PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE')),
  CONSTRAINT platform_invitations_token_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_platform_invitations_email ON platform_invitations(email_normalized, status);
CREATE INDEX IF NOT EXISTS idx_platform_invitations_status ON platform_invitations(status);
