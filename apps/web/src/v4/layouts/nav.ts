export type NavItem = {
  to: string;
  label: string;
  anyOf?: string[];
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

/** V4 merchant console navigation — permission-aware (no role === checks). */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{to: '/', label: 'Dashboard', anyOf: ['payments.read', 'org.read', 'billing.read']}],
  },
  {
    label: 'Payments',
    items: [
      {to: '/payments', label: 'Payments', anyOf: ['payments.read']},
      {to: '/transactions', label: 'Transactions', anyOf: ['payments.read']},
      {to: '/payment-links', label: 'Payment Links', anyOf: ['payment_links.read']},
      {to: '/payment-config', label: 'Payment Config', anyOf: ['payment_config.read']},
    ],
  },
  {
    label: 'Billing',
    items: [
      {to: '/customers', label: 'Customers', anyOf: ['customers.read', 'billing.read', 'billing.manage']},
      {to: '/products', label: 'Products', anyOf: ['products.read', 'plans.read', 'billing.manage']},
      {to: '/prices', label: 'Prices', anyOf: ['prices.read', 'plans.read', 'billing.manage']},
      {to: '/subscriptions', label: 'Subscriptions', anyOf: ['subscriptions.read', 'billing.read', 'billing.manage']},
      {to: '/invoices', label: 'Invoices', anyOf: ['invoices.read', 'billing.read', 'billing.manage']},
    ],
  },
  {
    label: 'Merchant',
    items: [
      {to: '/merchant/profile', label: 'Profile', anyOf: ['merchant.read']},
      {to: '/merchant/business', label: 'Business', anyOf: ['merchant.read']},
      {to: '/merchant/kyb', label: 'KYB', anyOf: ['kyb.read']},
      {to: '/merchant/documents', label: 'Documents', anyOf: ['documents.read']},
      {to: '/merchant/bank-accounts', label: 'Bank Accounts', anyOf: ['bank.read']},
    ],
  },
  {
    label: 'Providers',
    items: [
      {to: '/providers', label: 'Providers', anyOf: ['providers.read', 'developer.read']},
      {to: '/providers/accounts', label: 'Accounts & Routes', anyOf: ['providers.read']},
      {to: '/providers/webhooks', label: 'Webhook Events', anyOf: ['webhooks.read', 'events.read']},
    ],
  },
  {
    label: 'Developers',
    items: [
      {to: '/developers/api-keys', label: 'API Keys', anyOf: ['api_keys.read', 'developer.read']},
    ],
  },
  {
    label: 'Security',
    items: [
      {to: '/security/users', label: 'Users & Invites', anyOf: ['users.read']},
      {to: '/security/roles', label: 'Roles', anyOf: ['roles.read']},
      {to: '/security/audit', label: 'Audit', anyOf: ['audit.read']},
      {to: '/security/events', label: 'Security Events', anyOf: ['security.read']},
      {to: '/security/errors', label: 'Error Reports', anyOf: ['errors.read']},
    ],
  },
  {
    label: 'Settings',
    items: [
      {to: '/settings/organization', label: 'Organization', anyOf: ['org.read', 'settings.read']},
      {to: '/settings/appearance', label: 'Appearance', anyOf: ['settings.read', 'org.read']},
    ],
  },
  {
    label: 'Finance',
    items: [
      {to: '/refunds', label: 'Refunds', anyOf: ['payments.refund', 'payments.manage']},
      {to: '/balances', label: 'Balances', anyOf: ['balances.read']},
      {to: '/settlements', label: 'Settlements', anyOf: ['settlements.read', 'settlements.manage']},
      {to: '/payouts', label: 'Payouts', anyOf: ['payouts.read', 'payouts.manage']},
      {to: '/disputes', label: 'Disputes', anyOf: ['disputes.read', 'disputes.manage']},
      {to: '/risk', label: 'Risk', anyOf: ['disputes.read', 'platform.risk.manage']},
    ],
  },
  {
    label: 'Later phases',
    items: [
      {to: '/coming-soon/reconciliation', label: 'Reconciliation', anyOf: ['settlements.read', 'balances.read']},
      {to: '/coming-soon/reports', label: 'Reports', anyOf: ['reports.read']},
      {to: '/coming-soon/ledger', label: 'Ledger', anyOf: ['balances.read']},
    ],
  },
];
