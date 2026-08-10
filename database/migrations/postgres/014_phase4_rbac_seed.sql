-- Phase 4 RBAC: payments, payment links, payment config

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'payments.read', 'Read payment intents, sessions, attempts, transactions'),
  (gen_random_uuid(), 'payments.manage', 'Create/cancel payment intents and manage payment operations'),
  (gen_random_uuid(), 'payment_links.read', 'Read payment links'),
  (gen_random_uuid(), 'payment_links.manage', 'Create/update/activate/deactivate/cancel payment links'),
  (gen_random_uuid(), 'payment_config.read', 'Read merchant payment/branding configuration'),
  (gen_random_uuid(), 'payment_config.manage', 'Manage merchant payment/branding configuration')
ON CONFLICT (code) DO NOTHING;

-- Merchant owner/admin: full payment-side capabilities
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payments.manage',
  'payment_links.read', 'payment_links.manage',
  'payment_config.read', 'payment_config.manage'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN')
ON CONFLICT DO NOTHING;

-- Merchant finance: read + manage payments/links; read config
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payments.manage',
  'payment_links.read', 'payment_links.manage',
  'payment_config.read'
)
WHERE r.code = 'MERCHANT_FINANCE'
ON CONFLICT DO NOTHING;

-- Merchant developer: read payments/links/config (integration focus)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payment_links.read', 'payment_config.read'
)
WHERE r.code = 'MERCHANT_DEVELOPER'
ON CONFLICT DO NOTHING;

-- Support/viewer: read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payment_links.read', 'payment_config.read'
)
WHERE r.code IN ('MERCHANT_SUPPORT', 'MERCHANT_VIEWER')
ON CONFLICT DO NOTHING;

-- Platform owner/admin: full oversight
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payments.manage',
  'payment_links.read', 'payment_links.manage',
  'payment_config.read', 'payment_config.manage'
)
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;

-- Platform support/finance: read-only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.read', 'payment_links.read', 'payment_config.read'
)
WHERE r.code IN ('PLATFORM_SUPPORT', 'PLATFORM_FINANCE')
ON CONFLICT DO NOTHING;
