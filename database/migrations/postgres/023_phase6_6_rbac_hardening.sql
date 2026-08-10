-- Phase 6.6 hardening: ensure granular payment/subscription perms granted where manage already exists
-- Additive only; does not revoke prior grants.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'payments.cancel', 'payments.create',
  'subscriptions.create', 'subscriptions.pause', 'subscriptions.resume', 'subscriptions.cancel',
  'invoices.pay', 'invoices.create'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN', 'MERCHANT_FINANCE')
  AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('payments.cancel', 'payments.create')
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;

-- Notifications / books / transactions aliases (deferred or composed)
INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'notifications.read', 'Read notifications — deferred'),
  (gen_random_uuid(), 'notifications.manage', 'Manage notifications — deferred'),
  (gen_random_uuid(), 'books.read', 'Read books sync status — deferred'),
  (gen_random_uuid(), 'books.manage', 'Manage books connector — deferred'),
  (gen_random_uuid(), 'transactions.read', 'Read transaction views (composed from payments)'),
  (gen_random_uuid(), 'provider_credentials.manage', 'Manage live provider credentials — deferred')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'transactions.read'
WHERE r.code IN (
  'MERCHANT_OWNER', 'MERCHANT_ADMIN', 'MERCHANT_FINANCE',
  'MERCHANT_DEVELOPER', 'MERCHANT_SUPPORT', 'MERCHANT_VIEWER',
  'PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE'
) AND r.organization_id IS NULL
ON CONFLICT DO NOTHING;
