-- Phase 6.6: align role_permissions with production-oriented matrix (additive only)

-- OWNER / ADMIN: fine-grained + roles + settings + developer aggregates
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'users.invite', 'users.remove', 'roles.read', 'roles.manage',
  'security.manage', 'settings.read', 'settings.manage',
  'kyb.manage',
  'payments.create', 'payments.cancel',
  'checkout.read', 'checkout.manage',
  'events.read', 'developer.read', 'developer.manage',
  'plans.read', 'plans.manage',
  'subscriptions.create', 'subscriptions.cancel', 'subscriptions.pause', 'subscriptions.resume',
  'invoices.create', 'invoices.pay',
  'billing.read'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN') AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- FINANCE: billing fine-grained + billing.read (no api_keys.manage / roles.manage)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.create', 'payments.cancel',
  'checkout.read',
  'plans.read', 'plans.manage',
  'subscriptions.create', 'subscriptions.cancel', 'subscriptions.pause', 'subscriptions.resume',
  'invoices.create', 'invoices.pay',
  'billing.read',
  'settings.read',
  'kyb.manage'
)
WHERE r.code = 'MERCHANT_FINANCE' AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- DEVELOPER: developer + keys + events + checkout read + billing read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'developer.read', 'developer.manage',
  'events.read', 'checkout.read',
  'billing.read', 'plans.read',
  'settings.read'
)
WHERE r.code = 'MERCHANT_DEVELOPER' AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- SUPPORT: read-oriented extras
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'billing.read', 'plans.read', 'events.read', 'checkout.read', 'settings.read'
)
WHERE r.code = 'MERCHANT_SUPPORT' AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- VIEWER: billing.read / plans.read / settings.read only (no mutate)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'billing.read', 'plans.read', 'checkout.read', 'settings.read', 'events.read'
)
WHERE r.code = 'MERCHANT_VIEWER' AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- PLATFORM_OWNER / ADMIN: new platform permissions (they already CROSS JOIN all in 005 —
-- re-grant explicitly for clarity after new inserts; CROSS JOIN only ran at seed time)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN') AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- PLATFORM_SUPPORT / FINANCE: platform read subsets
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'platform.organizations.read', 'platform.users.read', 'platform.payments.read',
  'platform.audit_logs.read', 'roles.read', 'billing.read', 'events.read'
)
WHERE r.code IN ('PLATFORM_SUPPORT', 'PLATFORM_FINANCE') AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;
