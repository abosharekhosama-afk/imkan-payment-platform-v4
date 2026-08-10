-- Phase 1: seed V4 system roles + baseline permissions (no financial rules invented)

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'platform.admin', 'Platform administration'),
  (gen_random_uuid(), 'platform.support', 'Platform support access'),
  (gen_random_uuid(), 'platform.finance', 'Platform finance access'),
  (gen_random_uuid(), 'org.read', 'Read organization profile'),
  (gen_random_uuid(), 'org.manage', 'Manage organization settings'),
  (gen_random_uuid(), 'users.read', 'Read organization users'),
  (gen_random_uuid(), 'users.manage', 'Manage organization users and roles'),
  (gen_random_uuid(), 'audit.read', 'Read audit events'),
  (gen_random_uuid(), 'security.read', 'Read security events')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (id, code, name, scope, description, is_system) VALUES
  (gen_random_uuid(), 'PLATFORM_OWNER', 'Platform Owner', 'PLATFORM', 'Full platform ownership', TRUE),
  (gen_random_uuid(), 'PLATFORM_ADMIN', 'Platform Admin', 'PLATFORM', 'Platform administration', TRUE),
  (gen_random_uuid(), 'PLATFORM_SUPPORT', 'Platform Support', 'PLATFORM', 'Platform support', TRUE),
  (gen_random_uuid(), 'PLATFORM_FINANCE', 'Platform Finance', 'PLATFORM', 'Platform finance', TRUE),
  (gen_random_uuid(), 'MERCHANT_OWNER', 'Merchant Owner', 'MERCHANT', 'Merchant ownership', TRUE),
  (gen_random_uuid(), 'MERCHANT_ADMIN', 'Merchant Admin', 'MERCHANT', 'Merchant administration', TRUE),
  (gen_random_uuid(), 'MERCHANT_FINANCE', 'Merchant Finance', 'MERCHANT', 'Merchant finance', TRUE),
  (gen_random_uuid(), 'MERCHANT_SUPPORT', 'Merchant Support', 'MERCHANT', 'Merchant support', TRUE),
  (gen_random_uuid(), 'MERCHANT_DEVELOPER', 'Merchant Developer', 'MERCHANT', 'Merchant developer', TRUE),
  (gen_random_uuid(), 'MERCHANT_VIEWER', 'Merchant Viewer', 'MERCHANT', 'Read-only merchant access', TRUE)
ON CONFLICT (code) DO NOTHING;

-- PLATFORM_OWNER / PLATFORM_ADMIN: all platform + org oversight permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('platform.support', 'org.read', 'users.read', 'audit.read', 'security.read')
WHERE r.code = 'PLATFORM_SUPPORT'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('platform.finance', 'org.read', 'audit.read')
WHERE r.code = 'PLATFORM_FINANCE'
ON CONFLICT DO NOTHING;

-- Merchant roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('org.read', 'org.manage', 'users.read', 'users.manage', 'audit.read', 'security.read')
WHERE r.code = 'MERCHANT_OWNER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('org.read', 'org.manage', 'users.read', 'users.manage', 'audit.read')
WHERE r.code = 'MERCHANT_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('org.read', 'audit.read')
WHERE r.code IN ('MERCHANT_FINANCE', 'MERCHANT_SUPPORT', 'MERCHANT_DEVELOPER')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('org.read')
WHERE r.code = 'MERCHANT_VIEWER'
ON CONFLICT DO NOTHING;
