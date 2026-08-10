/**
 * Central Permission Catalog — single source of truth for V4 AuthZ codes.
 * DB seeds and route checks must use these constants (or aliases resolved here).
 *
 * Status:
 * - active: enforced on existing APIs
 * - deferred: reserved for Phase 7+ modules (no invented financial behavior)
 * - alias: maps alternate name → canonical DB code
 */

export type PermissionStatus = 'active' | 'deferred' | 'alias';

export type PermissionDef = {
  code: string;
  description: string;
  status: PermissionStatus;
  /** For alias entries: canonical code stored in DB */
  aliasOf?: string;
  scope?: 'MERCHANT' | 'PLATFORM' | 'BOTH';
};

/** Canonical active + deferred permission codes (DB). */
export const PERMISSIONS = {
  // Platform
  PLATFORM_ADMIN: 'platform.admin',
  PLATFORM_SUPPORT: 'platform.support',
  PLATFORM_FINANCE: 'platform.finance',
  PLATFORM_ORGANIZATIONS_READ: 'platform.organizations.read',
  PLATFORM_ORGANIZATIONS_MANAGE: 'platform.organizations.manage',
  PLATFORM_USERS_READ: 'platform.users.read',
  PLATFORM_USERS_MANAGE: 'platform.users.manage',
  PLATFORM_PAYMENTS_READ: 'platform.payments.read',
  PLATFORM_PROVIDERS_MANAGE: 'platform.providers.manage',
  PLATFORM_RISK_MANAGE: 'platform.risk.manage',
  PLATFORM_DISPUTES_MANAGE: 'platform.disputes.manage',
  PLATFORM_SETTLEMENTS_MANAGE: 'platform.settlements.manage',
  PLATFORM_AUDIT_LOGS_READ: 'platform.audit_logs.read',
  PLATFORM_SYSTEM_MANAGE: 'platform.system.manage',

  // Org / users
  ORG_READ: 'org.read',
  ORG_MANAGE: 'org.manage',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  USERS_DEACTIVATE: 'users.deactivate',
  USERS_INVITE: 'users.invite',
  USERS_REMOVE: 'users.remove',
  INVITES_MANAGE: 'invites.manage',
  ROLES_READ: 'roles.read',
  ROLES_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
  SECURITY_READ: 'security.read',
  SECURITY_MANAGE: 'security.manage',
  ERRORS_READ: 'errors.read',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',

  // Merchant / KYB
  MERCHANT_READ: 'merchant.read',
  MERCHANT_MANAGE: 'merchant.manage',
  KYB_READ: 'kyb.read',
  KYB_SUBMIT: 'kyb.submit',
  KYB_MANAGE: 'kyb.manage',
  KYB_REVIEW: 'kyb.review',
  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_MANAGE: 'documents.manage',
  BANK_READ: 'bank.read',
  BANK_MANAGE: 'bank.manage',
  BANK_REVIEW: 'bank.review',
  MASTERDATA_MANAGE: 'masterdata.manage',

  // Payments
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_MANAGE: 'payments.manage',
  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_CAPTURE: 'payments.capture',
  PAYMENTS_CANCEL: 'payments.cancel',
  PAYMENTS_REFUND: 'payments.refund',
  PAYMENTS_PARTIAL_REFUND: 'payments.partial_refund',
  PAYMENT_LINKS_READ: 'payment_links.read',
  PAYMENT_LINKS_MANAGE: 'payment_links.manage',
  PAYMENT_CONFIG_READ: 'payment_config.read',
  PAYMENT_CONFIG_MANAGE: 'payment_config.manage',
  CHECKOUT_READ: 'checkout.read',
  CHECKOUT_MANAGE: 'checkout.manage',

  // Providers / developer
  PROVIDERS_READ: 'providers.read',
  PROVIDERS_MANAGE: 'providers.manage',
  API_KEYS_READ: 'api_keys.read',
  API_KEYS_MANAGE: 'api_keys.manage',
  WEBHOOKS_READ: 'webhooks.read',
  WEBHOOKS_MANAGE: 'webhooks.manage',
  EVENTS_READ: 'events.read',
  INTEGRATIONS_READ: 'integrations.read',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  DEVELOPER_READ: 'developer.read',
  DEVELOPER_MANAGE: 'developer.manage',

  // Billing
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_MANAGE: 'customers.manage',
  PRODUCTS_READ: 'products.read',
  PRODUCTS_MANAGE: 'products.manage',
  PRICES_READ: 'prices.read',
  PRICES_MANAGE: 'prices.manage',
  PLANS_READ: 'plans.read',
  PLANS_MANAGE: 'plans.manage',
  SUBSCRIPTIONS_READ: 'subscriptions.read',
  SUBSCRIPTIONS_MANAGE: 'subscriptions.manage',
  SUBSCRIPTIONS_CREATE: 'subscriptions.create',
  SUBSCRIPTIONS_CANCEL: 'subscriptions.cancel',
  SUBSCRIPTIONS_PAUSE: 'subscriptions.pause',
  SUBSCRIPTIONS_RESUME: 'subscriptions.resume',
  INVOICES_READ: 'invoices.read',
  INVOICES_MANAGE: 'invoices.manage',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_SEND: 'invoices.send',
  INVOICES_PAY: 'invoices.pay',
  INVOICES_VOID: 'invoices.void',
  INVOICES_REFUND: 'invoices.refund',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',

  // Financial / risk (deferred modules — Phase 7+)
  BALANCES_READ: 'balances.read',
  SETTLEMENTS_READ: 'settlements.read',
  SETTLEMENTS_MANAGE: 'settlements.manage',
  PAYOUTS_READ: 'payouts.read',
  PAYOUTS_MANAGE: 'payouts.manage',
  DISPUTES_READ: 'disputes.read',
  DISPUTES_MANAGE: 'disputes.manage',
  REPORTS_READ: 'reports.read',
  REPORTS_MANAGE: 'reports.manage',
  TRANSACTIONS_READ: 'transactions.read',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  BOOKS_READ: 'books.read',
  BOOKS_MANAGE: 'books.manage',
  PROVIDER_CREDENTIALS_MANAGE: 'provider_credentials.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Alias names from Phase 6.6 brief → canonical DB codes */
export const PERMISSION_ALIASES: Record<string, string> = {
  'organization.read': PERMISSIONS.ORG_READ,
  'organization.manage': PERMISSIONS.ORG_MANAGE,
  'audit_logs.read': PERMISSIONS.AUDIT_READ,
};

export const PERMISSION_DEFINITIONS: PermissionDef[] = [
  {code: PERMISSIONS.PLATFORM_ADMIN, description: 'Platform administration', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_SUPPORT, description: 'Platform support', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_FINANCE, description: 'Platform finance', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_ORGANIZATIONS_READ, description: 'Read all organizations', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_ORGANIZATIONS_MANAGE, description: 'Manage organizations (platform)', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_USERS_READ, description: 'Read users across orgs', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_USERS_MANAGE, description: 'Manage users across orgs', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_PAYMENTS_READ, description: 'Read payments across orgs', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_PROVIDERS_MANAGE, description: 'Manage providers globally', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_RISK_MANAGE, description: 'Manage risk (platform)', status: 'deferred', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_DISPUTES_MANAGE, description: 'Manage disputes (platform)', status: 'deferred', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_SETTLEMENTS_MANAGE, description: 'Manage settlements (platform)', status: 'deferred', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_AUDIT_LOGS_READ, description: 'Read platform audit logs', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.PLATFORM_SYSTEM_MANAGE, description: 'System configuration', status: 'deferred', scope: 'PLATFORM'},

  {code: PERMISSIONS.ORG_READ, description: 'Read organization', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.ORG_MANAGE, description: 'Manage organization', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.USERS_READ, description: 'Read users', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.USERS_MANAGE, description: 'Manage users', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.USERS_DEACTIVATE, description: 'Deactivate users', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.USERS_INVITE, description: 'Invite users', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.USERS_REMOVE, description: 'Remove users', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVITES_MANAGE, description: 'Manage invitations', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.ROLES_READ, description: 'Read roles', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.ROLES_MANAGE, description: 'Manage custom roles', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.AUDIT_READ, description: 'Read audit events', status: 'active', scope: 'BOTH'},
  {code: PERMISSIONS.SECURITY_READ, description: 'Read security events', status: 'active', scope: 'BOTH'},
  {code: PERMISSIONS.SECURITY_MANAGE, description: 'Manage security settings', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.ERRORS_READ, description: 'Read error reports', status: 'active', scope: 'BOTH'},
  {code: PERMISSIONS.SETTINGS_READ, description: 'Read settings', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SETTINGS_MANAGE, description: 'Manage settings', status: 'active', scope: 'MERCHANT'},

  {code: PERMISSIONS.MERCHANT_READ, description: 'Read merchant profile', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.MERCHANT_MANAGE, description: 'Manage merchant profile', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.KYB_READ, description: 'Read KYB', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.KYB_SUBMIT, description: 'Submit KYB', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.KYB_MANAGE, description: 'Manage KYB (merchant)', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.KYB_REVIEW, description: 'Review KYB (platform)', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.DOCUMENTS_READ, description: 'Read documents', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.DOCUMENTS_MANAGE, description: 'Manage documents', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.BANK_READ, description: 'Read bank accounts', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.BANK_MANAGE, description: 'Manage bank accounts', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.BANK_REVIEW, description: 'Review bank accounts (platform)', status: 'active', scope: 'PLATFORM'},
  {code: PERMISSIONS.MASTERDATA_MANAGE, description: 'Manage master data', status: 'active', scope: 'PLATFORM'},

  {code: PERMISSIONS.PAYMENTS_READ, description: 'Read payments', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_MANAGE, description: 'Manage payments (aggregate)', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_CREATE, description: 'Create payment intents', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_CAPTURE, description: 'Capture payments', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_CANCEL, description: 'Cancel payment intents', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_REFUND, description: 'Refund payments', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENTS_PARTIAL_REFUND, description: 'Partial refund', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENT_LINKS_READ, description: 'Read payment links', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENT_LINKS_MANAGE, description: 'Manage payment links', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENT_CONFIG_READ, description: 'Read payment config', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYMENT_CONFIG_MANAGE, description: 'Manage payment config', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.CHECKOUT_READ, description: 'Read checkout config', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.CHECKOUT_MANAGE, description: 'Manage checkout config', status: 'active', scope: 'MERCHANT'},

  {code: PERMISSIONS.PROVIDERS_READ, description: 'Read providers', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PROVIDERS_MANAGE, description: 'Manage providers', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.API_KEYS_READ, description: 'Read API keys', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.API_KEYS_MANAGE, description: 'Manage API keys', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.WEBHOOKS_READ, description: 'Read webhooks', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.WEBHOOKS_MANAGE, description: 'Manage webhook endpoints', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.EVENTS_READ, description: 'Read events', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INTEGRATIONS_READ, description: 'Read integrations', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.INTEGRATIONS_MANAGE, description: 'Manage integrations', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.DEVELOPER_READ, description: 'Developer read aggregate', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.DEVELOPER_MANAGE, description: 'Developer manage aggregate', status: 'active', scope: 'MERCHANT'},

  {code: PERMISSIONS.CUSTOMERS_READ, description: 'Read customers', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.CUSTOMERS_MANAGE, description: 'Manage customers', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PRODUCTS_READ, description: 'Read products', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PRODUCTS_MANAGE, description: 'Manage products', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PRICES_READ, description: 'Read prices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PRICES_MANAGE, description: 'Manage prices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PLANS_READ, description: 'Read plans (alias of products/prices)', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PLANS_MANAGE, description: 'Manage plans', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_READ, description: 'Read subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_MANAGE, description: 'Manage subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_CREATE, description: 'Create subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_CANCEL, description: 'Cancel subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_PAUSE, description: 'Pause subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SUBSCRIPTIONS_RESUME, description: 'Resume subscriptions', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_READ, description: 'Read invoices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_MANAGE, description: 'Manage invoices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_CREATE, description: 'Create invoices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_SEND, description: 'Send invoices', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_PAY, description: 'Collect/pay invoices', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_VOID, description: 'Void invoices', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.INVOICES_REFUND, description: 'Refund invoices', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.BILLING_READ, description: 'Billing read aggregate', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.BILLING_MANAGE, description: 'Billing manage aggregate', status: 'active', scope: 'MERCHANT'},

  {code: PERMISSIONS.BALANCES_READ, description: 'Read balances', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SETTLEMENTS_READ, description: 'Read settlements', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.SETTLEMENTS_MANAGE, description: 'Manage settlements', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYOUTS_READ, description: 'Read payouts', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.PAYOUTS_MANAGE, description: 'Manage payouts', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.DISPUTES_READ, description: 'Read disputes', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.DISPUTES_MANAGE, description: 'Manage disputes', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.REPORTS_READ, description: 'Read reports', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.REPORTS_MANAGE, description: 'Manage reports', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.TRANSACTIONS_READ, description: 'Read transaction views (composed)', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.NOTIFICATIONS_READ, description: 'Read notifications', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.NOTIFICATIONS_MANAGE, description: 'Manage notifications', status: 'deferred', scope: 'MERCHANT'},
  {code: PERMISSIONS.BOOKS_READ, description: 'Read books sync status', status: 'active', scope: 'MERCHANT'},
  {code: PERMISSIONS.BOOKS_MANAGE, description: 'Manage books connector', status: 'active', scope: 'MERCHANT'},
  {
    code: PERMISSIONS.PROVIDER_CREDENTIALS_MANAGE,
    description: 'Manage live provider credentials',
    status: 'deferred',
    scope: 'MERCHANT',
  },
];

export function resolvePermissionCode(code: string): string {
  return PERMISSION_ALIASES[code] || code;
}

export function authHasPermission(granted: string[] | undefined | null, ...required: string[]): boolean {
  if (!granted?.length) return false;
  if (granted.includes(PERMISSIONS.PLATFORM_ADMIN)) return true;
  const set = new Set(granted);
  return required.some((r) => set.has(resolvePermissionCode(r)));
}

export function authHasAllPermissions(granted: string[] | undefined | null, ...required: string[]): boolean {
  if (!granted?.length) return false;
  if (granted.includes(PERMISSIONS.PLATFORM_ADMIN)) return true;
  const set = new Set(granted);
  return required.every((r) => set.has(resolvePermissionCode(r)));
}

/** True if every permission in `requested` is also in `granted` (no escalation). */
export function isPermissionSubset(granted: string[], requested: string[]): boolean {
  if (granted.includes(PERMISSIONS.PLATFORM_ADMIN)) return true;
  const set = new Set(granted.map(resolvePermissionCode));
  return requested.every((r) => set.has(resolvePermissionCode(r)));
}

export const MERCHANT_SYSTEM_ROLES = [
  'MERCHANT_OWNER',
  'MERCHANT_ADMIN',
  'MERCHANT_FINANCE',
  'MERCHANT_DEVELOPER',
  'MERCHANT_SUPPORT',
  'MERCHANT_VIEWER',
] as const;

export const PLATFORM_SYSTEM_ROLES = [
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'PLATFORM_FINANCE',
] as const;

export type MerchantSystemRole = (typeof MERCHANT_SYSTEM_ROLES)[number];
export type PlatformSystemRole = (typeof PLATFORM_SYSTEM_ROLES)[number];
