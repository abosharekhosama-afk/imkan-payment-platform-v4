-- Phase 5 RBAC: providers, webhooks (admin), API keys

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'providers.read', 'Read provider catalog, accounts, capabilities, routes'),
  (gen_random_uuid(), 'providers.manage', 'Manage provider accounts, routes, and credentials metadata'),
  (gen_random_uuid(), 'api_keys.read', 'List API keys (prefixes only)'),
  (gen_random_uuid(), 'api_keys.manage', 'Create and revoke API keys'),
  (gen_random_uuid(), 'webhooks.read', 'Read inbound provider webhook event metadata')
ON CONFLICT (code) DO NOTHING;

-- Merchant owner/admin: manage own provider routes/accounts (sandbox), API keys
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'providers.read', 'providers.manage',
  'api_keys.read', 'api_keys.manage',
  'webhooks.read'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN')
ON CONFLICT DO NOTHING;

-- Merchant developer: API keys + provider read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('providers.read', 'api_keys.read', 'api_keys.manage', 'webhooks.read')
WHERE r.code = 'MERCHANT_DEVELOPER'
ON CONFLICT DO NOTHING;

-- Merchant finance/support/viewer: read providers only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('providers.read', 'webhooks.read')
WHERE r.code IN ('MERCHANT_FINANCE', 'MERCHANT_SUPPORT', 'MERCHANT_VIEWER')
ON CONFLICT DO NOTHING;

-- Platform owner/admin: full
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'providers.read', 'providers.manage',
  'api_keys.read', 'api_keys.manage',
  'webhooks.read'
)
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;

-- Platform support: read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('providers.read', 'webhooks.read', 'api_keys.read')
WHERE r.code IN ('PLATFORM_SUPPORT', 'PLATFORM_FINANCE')
ON CONFLICT DO NOTHING;
