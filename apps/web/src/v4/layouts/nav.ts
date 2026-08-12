export type NavItem = {
  to: string;
  labelKey: string;
  anyOf?: string[];
};

export type NavSection = {
  labelKey: string;
  items: NavItem[];
};

/** V4 merchant console navigation — permission-aware (no role === checks). */
export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'section.overview',
    items: [{to: '/', labelKey: 'nav.dashboard', anyOf: ['payments.read', 'org.read', 'billing.read']}],
  },
  {
    labelKey: 'section.payments',
    items: [
      {to: '/payments', labelKey: 'nav.payments', anyOf: ['payments.read']},
      {to: '/transactions', labelKey: 'nav.transactions', anyOf: ['payments.read']},
      {to: '/payment-links', labelKey: 'nav.paymentLinks', anyOf: ['payment_links.read']},
      {to: '/payment-config', labelKey: 'nav.paymentConfig', anyOf: ['payment_config.read']},
    ],
  },
  {
    labelKey: 'section.billing',
    items: [
      {to: '/customers', labelKey: 'nav.customers', anyOf: ['customers.read', 'billing.read', 'billing.manage']},
      {to: '/products', labelKey: 'nav.products', anyOf: ['products.read', 'plans.read', 'billing.manage']},
      {to: '/prices', labelKey: 'nav.prices', anyOf: ['prices.read', 'plans.read', 'billing.manage']},
      {to: '/subscriptions', labelKey: 'nav.subscriptions', anyOf: ['subscriptions.read', 'billing.read', 'billing.manage']},
      {to: '/invoices', labelKey: 'nav.invoices', anyOf: ['invoices.read', 'billing.read', 'billing.manage']},
    ],
  },
  {
    labelKey: 'section.merchant',
    items: [
      {to: '/merchant/profile', labelKey: 'nav.profile', anyOf: ['merchant.read']},
      {to: '/merchant/business', labelKey: 'nav.business', anyOf: ['merchant.read']},
      {to: '/merchant/people', labelKey: 'nav.people', anyOf: ['merchant.read']},
      {to: '/merchant/kyb', labelKey: 'nav.kyb', anyOf: ['kyb.read']},
      {to: '/merchant/documents', labelKey: 'nav.documents', anyOf: ['documents.read']},
      {to: '/merchant/bank-accounts', labelKey: 'nav.bankAccounts', anyOf: ['bank.read']},
    ],
  },
  {
    labelKey: 'section.providers',
    items: [
      {to: '/providers', labelKey: 'nav.providers', anyOf: ['providers.read', 'developer.read']},
      {to: '/providers/accounts', labelKey: 'nav.providerAccounts', anyOf: ['providers.read']},
      {to: '/providers/webhooks', labelKey: 'nav.webhooks', anyOf: ['webhooks.read', 'events.read']},
    ],
  },
  {
    labelKey: 'section.developers',
    items: [{to: '/developers/api-keys', labelKey: 'nav.apiKeys', anyOf: ['api_keys.read', 'developer.read']}],
  },
  {
    labelKey: 'section.security',
    items: [
      {to: '/security/users', labelKey: 'nav.users', anyOf: ['users.read']},
      {to: '/security/roles', labelKey: 'nav.roles', anyOf: ['roles.read']},
      {to: '/security/audit', labelKey: 'nav.audit', anyOf: ['audit.read']},
      {to: '/security/events', labelKey: 'nav.securityEvents', anyOf: ['security.read']},
      {to: '/security/errors', labelKey: 'nav.errors', anyOf: ['errors.read']},
    ],
  },
  {
    labelKey: 'section.settings',
    items: [
      {to: '/settings/organization', labelKey: 'nav.organization', anyOf: ['org.read', 'settings.read']},
      {to: '/settings/appearance', labelKey: 'nav.appearance', anyOf: ['settings.read', 'org.read']},
    ],
  },
  {
    labelKey: 'section.finance',
    items: [
      {to: '/refunds', labelKey: 'nav.refunds', anyOf: ['payments.refund', 'payments.manage']},
      {to: '/balances', labelKey: 'nav.balances', anyOf: ['balances.read']},
      {to: '/settlements', labelKey: 'nav.settlements', anyOf: ['settlements.read', 'settlements.manage']},
      {to: '/payouts', labelKey: 'nav.payouts', anyOf: ['payouts.read', 'payouts.manage']},
      {to: '/disputes', labelKey: 'nav.disputes', anyOf: ['disputes.read', 'disputes.manage']},
      {to: '/risk', labelKey: 'nav.risk', anyOf: ['disputes.read', 'platform.risk.manage']},
    ],
  },
  {
    labelKey: 'section.platform',
    items: [
      {to: '/platform/kyb', labelKey: 'nav.kybReview', anyOf: ['kyb.review']},
      {to: '/platform/team', labelKey: 'nav.platformTeam', anyOf: ['platform.users.read', 'platform.admin']},
    ],
  },
  {
    labelKey: 'section.later',
    items: [
      {to: '/coming-soon/reconciliation', labelKey: 'nav.reconciliation', anyOf: ['settlements.read', 'balances.read']},
      {to: '/coming-soon/reports', labelKey: 'nav.reports', anyOf: ['reports.read']},
      {to: '/coming-soon/ledger', labelKey: 'nav.ledger', anyOf: ['balances.read']},
    ],
  },
];
