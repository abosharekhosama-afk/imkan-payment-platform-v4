-- Phase 3 permission expansions (merchant/KYB/documents/banking/master data)

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'merchant.read', 'Read merchant/company profile data'),
  (gen_random_uuid(), 'merchant.manage', 'Manage merchant/company profile data'),
  (gen_random_uuid(), 'kyb.read', 'Read KYB case status and results'),
  (gen_random_uuid(), 'kyb.submit', 'Submit/resubmit KYB case'),
  (gen_random_uuid(), 'kyb.review', 'Review and decide KYB cases (platform)'),
  (gen_random_uuid(), 'documents.read', 'Read document metadata'),
  (gen_random_uuid(), 'documents.manage', 'Register/archive document metadata'),
  (gen_random_uuid(), 'bank.read', 'Read masked payout account data'),
  (gen_random_uuid(), 'bank.manage', 'Add/activate/deactivate payout accounts'),
  (gen_random_uuid(), 'bank.review', 'Review and verify payout accounts (platform)'),
  (gen_random_uuid(), 'masterdata.manage', 'Administer global master data (platform)')
ON CONFLICT (code) DO NOTHING;

-- Merchant owner/admin: full merchant-side capabilities.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'merchant.read', 'merchant.manage', 'kyb.read', 'kyb.submit',
  'documents.read', 'documents.manage', 'bank.read', 'bank.manage'
)
WHERE r.code IN ('MERCHANT_OWNER', 'MERCHANT_ADMIN')
ON CONFLICT DO NOTHING;

-- Merchant finance: read + payout account management (step-up enforced at API).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('merchant.read', 'kyb.read', 'documents.read', 'bank.read', 'bank.manage')
WHERE r.code = 'MERCHANT_FINANCE'
ON CONFLICT DO NOTHING;

-- Merchant support/developer/viewer: read-only (banking data always masked).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('merchant.read', 'kyb.read', 'documents.read', 'bank.read')
WHERE r.code IN ('MERCHANT_SUPPORT', 'MERCHANT_DEVELOPER', 'MERCHANT_VIEWER')
ON CONFLICT DO NOTHING;

-- Platform owner/admin: all Phase 3 permissions including review + master data admin.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN (
  'merchant.read', 'merchant.manage', 'kyb.read', 'kyb.submit', 'kyb.review',
  'documents.read', 'documents.manage', 'bank.read', 'bank.manage', 'bank.review',
  'masterdata.manage'
)
WHERE r.code IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
ON CONFLICT DO NOTHING;

-- Platform support: read-only oversight.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('merchant.read', 'kyb.read', 'documents.read', 'bank.read')
WHERE r.code = 'PLATFORM_SUPPORT'
ON CONFLICT DO NOTHING;

-- Platform finance: merchant + bank read (masked).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('merchant.read', 'bank.read')
WHERE r.code = 'PLATFORM_FINANCE'
ON CONFLICT DO NOTHING;
