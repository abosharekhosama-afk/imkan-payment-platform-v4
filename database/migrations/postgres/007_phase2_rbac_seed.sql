-- Phase 2 permission expansions (no financial authorities invented)

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'invites.manage', 'Create and revoke organization invitations'),
  (gen_random_uuid(), 'users.deactivate', 'Activate/deactivate organization users'),
  (gen_random_uuid(), 'errors.read', 'Read API error reports for the organization')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('invites.manage', 'users.deactivate', 'errors.read', 'users.manage', 'users.read', 'org.manage', 'org.read', 'audit.read', 'security.read')
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('invites.manage', 'users.read', 'org.read', 'errors.read')
WHERE r.code = 'PLATFORM_ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('users.read', 'org.read', 'errors.read')
WHERE r.code = 'PLATFORM_SUPPORT'
ON CONFLICT DO NOTHING;
