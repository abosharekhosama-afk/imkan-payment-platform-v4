-- P16.8: Merchant outbound webhooks (HMAC delivery from PG outbox)

CREATE TABLE IF NOT EXISTS merchant_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  description TEXT,
  secret_encrypted TEXT NOT NULL,
  subscribed_events JSONB NOT NULL DEFAULT '["payment.succeeded","payment.failed","refund.succeeded"]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_webhook_endpoints_status_chk CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE INDEX IF NOT EXISTS idx_merchant_webhook_endpoints_org
  ON merchant_webhook_endpoints(organization_id, status);

CREATE TABLE IF NOT EXISTS merchant_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  endpoint_id UUID NOT NULL REFERENCES merchant_webhook_endpoints(id) ON DELETE CASCADE,
  outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt INT NOT NULL DEFAULT 0,
  response_code INT,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_webhook_deliveries_status_chk CHECK (
    status IN ('PENDING', 'RETRYING', 'DELIVERED', 'FAILED')
  ),
  CONSTRAINT merchant_webhook_deliveries_attempt_chk CHECK (attempt >= 0),
  CONSTRAINT merchant_webhook_deliveries_uq UNIQUE (endpoint_id, outbox_event_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_webhook_deliveries_pending
  ON merchant_webhook_deliveries(status, next_retry_at)
  WHERE status IN ('PENDING', 'RETRYING');

CREATE INDEX IF NOT EXISTS idx_merchant_webhook_deliveries_org
  ON merchant_webhook_deliveries(organization_id, created_at DESC);

-- Grant manage permission to merchant owners/admins/developers + platform
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'webhooks.manage'
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN', 'MERCHANT_DEVELOPER', 'PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;
