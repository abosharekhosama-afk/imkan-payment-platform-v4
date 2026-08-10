-- Activate deferred financial permissions for owner/admin/finance (additive)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN', 'MERCHANT_FINANCE')
  AND r.organization_id IS NULL
  AND p.code IN (
    'payments.refund', 'payments.partial_refund',
    'balances.read',
    'settlements.read', 'settlements.manage',
    'payouts.read', 'payouts.manage',
    'disputes.read', 'disputes.manage',
    'reports.read',
    'books.read', 'books.manage'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
  AND r.organization_id IS NULL
  AND p.code IN (
    'payments.refund', 'balances.read', 'settlements.manage', 'payouts.manage',
    'disputes.manage', 'books.manage', 'platform.settlements.manage', 'platform.disputes.manage'
  )
ON CONFLICT DO NOTHING;
