-- MFA / TOTP resend requests (platform-approved delivery)

CREATE TABLE IF NOT EXISTS mfa_totp_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by_user_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mfa_totp_requests_status ON mfa_totp_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_mfa_totp_requests_user ON mfa_totp_requests(user_id, status);
