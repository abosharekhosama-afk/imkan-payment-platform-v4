-- Phase 6 RBAC: customers, products, prices, subscriptions, invoices, billing

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'customers.read', 'Read customers'),
  (gen_random_uuid(), 'customers.manage', 'Create/update customers'),
  (gen_random_uuid(), 'products.read', 'Read products'),
  (gen_random_uuid(), 'products.manage', 'Manage products'),
  (gen_random_uuid(), 'prices.read', 'Read prices'),
  (gen_random_uuid(), 'prices.manage', 'Manage prices'),
  (gen_random_uuid(), 'subscriptions.read', 'Read subscriptions'),
  (gen_random_uuid(), 'subscriptions.manage', 'Manage subscription lifecycle'),
  (gen_random_uuid(), 'invoices.read', 'Read invoices'),
  (gen_random_uuid(), 'invoices.manage', 'Manage invoices and collection'),
  (gen_random_uuid(), 'billing.manage', 'Full billing operations aggregate')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'customers.manage',
  'products.read', 'products.manage',
  'prices.read', 'prices.manage',
  'subscriptions.read', 'subscriptions.manage',
  'invoices.read', 'invoices.manage',
  'billing.manage'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'customers.manage',
  'products.read', 'products.manage',
  'prices.read', 'prices.manage',
  'subscriptions.read', 'subscriptions.manage',
  'invoices.read', 'invoices.manage',
  'billing.manage'
)
WHERE r.code = 'MERCHANT_FINANCE'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'products.read', 'prices.read',
  'subscriptions.read', 'invoices.read'
)
WHERE r.code = 'MERCHANT_DEVELOPER'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'products.read', 'prices.read',
  'subscriptions.read', 'invoices.read'
)
WHERE r.code IN ('MERCHANT_SUPPORT', 'MERCHANT_VIEWER')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'customers.manage',
  'products.read', 'products.manage',
  'prices.read', 'prices.manage',
  'subscriptions.read', 'subscriptions.manage',
  'invoices.read', 'invoices.manage',
  'billing.manage'
)
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'customers.read', 'products.read', 'prices.read',
  'subscriptions.read', 'invoices.read'
)
WHERE r.code IN ('PLATFORM_SUPPORT', 'PLATFORM_FINANCE')
ON CONFLICT DO NOTHING;
