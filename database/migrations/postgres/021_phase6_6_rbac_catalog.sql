-- Phase 6.6: expand permission catalog (additive) + custom role org scoping

-- Allow organization-scoped custom roles (system roles keep organization_id NULL)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_code_uq;
CREATE UNIQUE INDEX IF NOT EXISTS roles_system_code_uq ON roles (code) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_org_code_uq ON roles (organization_id, code) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roles_organization ON roles (organization_id) WHERE organization_id IS NOT NULL;

-- New / fine-grained / platform / deferred permissions (no financial behavior invented)
INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'platform.organizations.read', 'Read organizations (platform)'),
  (gen_random_uuid(), 'platform.organizations.manage', 'Manage organizations (platform)'),
  (gen_random_uuid(), 'platform.users.read', 'Read users across organizations (platform)'),
  (gen_random_uuid(), 'platform.users.manage', 'Manage users across organizations (platform)'),
  (gen_random_uuid(), 'platform.payments.read', 'Read payments across organizations (platform)'),
  (gen_random_uuid(), 'platform.providers.manage', 'Manage providers globally (platform)'),
  (gen_random_uuid(), 'platform.risk.manage', 'Manage risk (platform) — deferred'),
  (gen_random_uuid(), 'platform.disputes.manage', 'Manage disputes (platform) — deferred'),
  (gen_random_uuid(), 'platform.settlements.manage', 'Manage settlements (platform) — deferred'),
  (gen_random_uuid(), 'platform.audit_logs.read', 'Read platform audit logs'),
  (gen_random_uuid(), 'platform.system.manage', 'System configuration — deferred'),

  (gen_random_uuid(), 'users.invite', 'Invite organization users'),
  (gen_random_uuid(), 'users.remove', 'Remove organization users'),
  (gen_random_uuid(), 'roles.read', 'Read roles and role permissions'),
  (gen_random_uuid(), 'roles.manage', 'Create and manage custom roles'),
  (gen_random_uuid(), 'security.manage', 'Manage security settings'),
  (gen_random_uuid(), 'settings.read', 'Read organization settings'),
  (gen_random_uuid(), 'settings.manage', 'Manage organization settings'),

  (gen_random_uuid(), 'kyb.manage', 'Manage KYB submissions (merchant)'),
  (gen_random_uuid(), 'payments.create', 'Create payment intents'),
  (gen_random_uuid(), 'payments.capture', 'Capture payments — deferred'),
  (gen_random_uuid(), 'payments.cancel', 'Cancel payment intents'),
  (gen_random_uuid(), 'payments.refund', 'Refund payments — deferred'),
  (gen_random_uuid(), 'payments.partial_refund', 'Partial refund — deferred'),
  (gen_random_uuid(), 'checkout.read', 'Read checkout configuration'),
  (gen_random_uuid(), 'checkout.manage', 'Manage checkout configuration'),

  (gen_random_uuid(), 'webhooks.manage', 'Manage webhook endpoints — deferred'),
  (gen_random_uuid(), 'events.read', 'Read domain/outbox events metadata'),
  (gen_random_uuid(), 'integrations.read', 'Read integrations — deferred'),
  (gen_random_uuid(), 'integrations.manage', 'Manage integrations — deferred'),
  (gen_random_uuid(), 'developer.read', 'Developer read aggregate'),
  (gen_random_uuid(), 'developer.manage', 'Developer manage aggregate'),

  (gen_random_uuid(), 'plans.read', 'Read billing plans'),
  (gen_random_uuid(), 'plans.manage', 'Manage billing plans'),
  (gen_random_uuid(), 'subscriptions.create', 'Create subscriptions'),
  (gen_random_uuid(), 'subscriptions.cancel', 'Cancel subscriptions'),
  (gen_random_uuid(), 'subscriptions.pause', 'Pause subscriptions'),
  (gen_random_uuid(), 'subscriptions.resume', 'Resume subscriptions'),
  (gen_random_uuid(), 'invoices.create', 'Create invoices'),
  (gen_random_uuid(), 'invoices.send', 'Send invoices — deferred'),
  (gen_random_uuid(), 'invoices.pay', 'Collect invoice payment'),
  (gen_random_uuid(), 'invoices.void', 'Void invoices — deferred'),
  (gen_random_uuid(), 'invoices.refund', 'Refund invoices — deferred'),
  (gen_random_uuid(), 'billing.read', 'Billing read aggregate'),

  (gen_random_uuid(), 'balances.read', 'Read balances — deferred Phase 7'),
  (gen_random_uuid(), 'settlements.read', 'Read settlements — deferred Phase 7'),
  (gen_random_uuid(), 'settlements.manage', 'Manage settlements — deferred Phase 7'),
  (gen_random_uuid(), 'payouts.read', 'Read payouts — deferred Phase 7'),
  (gen_random_uuid(), 'payouts.manage', 'Manage payouts — deferred Phase 7'),
  (gen_random_uuid(), 'disputes.read', 'Read disputes — deferred'),
  (gen_random_uuid(), 'disputes.manage', 'Manage disputes — deferred'),
  (gen_random_uuid(), 'reports.read', 'Read reports — deferred'),
  (gen_random_uuid(), 'reports.manage', 'Manage reports — deferred')
ON CONFLICT (code) DO NOTHING;
