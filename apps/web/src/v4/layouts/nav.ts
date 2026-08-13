export type NavItem = {
  to: string;
  labelKey: string;
  icon?: string;
  anyOf?: string[];
};

export type NavSection = {
  labelKey: string;
  items: NavItem[];
};

/** Flat, permission-aware console navigation (no collapsible menus). */
export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'section.overview',
    items: [{to: '/', labelKey: 'nav.dashboard', icon: 'home', anyOf: ['payments.read', 'org.read', 'billing.read']}],
  },
  {
    labelKey: 'section.payments',
    items: [
      {to: '/payments', labelKey: 'nav.payments', icon: 'card', anyOf: ['payments.read']},
      {to: '/transactions', labelKey: 'nav.transactions', icon: 'list', anyOf: ['payments.read']},
      {to: '/payment-links', labelKey: 'nav.paymentLinks', icon: 'link', anyOf: ['payment_links.read']},
      {to: '/payment-config', labelKey: 'nav.paymentConfig', icon: 'sliders', anyOf: ['payment_config.read']},
    ],
  },
  {
    labelKey: 'section.customers',
    items: [
      {to: '/customers', labelKey: 'nav.customers', icon: 'users', anyOf: ['customers.read', 'billing.read', 'billing.manage']},
    ],
  },
  {
    labelKey: 'section.merchant',
    items: [
      {to: '/merchant/profile', labelKey: 'nav.profile', icon: 'building', anyOf: ['merchant.read']},
      {to: '/merchant/business', labelKey: 'nav.business', icon: 'briefcase', anyOf: ['merchant.read']},
      {to: '/merchant/people', labelKey: 'nav.people', icon: 'users', anyOf: ['merchant.read']},
      {to: '/merchant/kyb', labelKey: 'nav.kyb', icon: 'shield', anyOf: ['kyb.read']},
      {to: '/merchant/documents', labelKey: 'nav.documents', icon: 'file', anyOf: ['documents.read']},
      {to: '/merchant/bank-accounts', labelKey: 'nav.bankAccounts', icon: 'bank', anyOf: ['bank.read']},
    ],
  },
  {
    labelKey: 'section.providers',
    items: [
      {to: '/providers', labelKey: 'nav.providers', icon: 'plug', anyOf: ['providers.read', 'developer.read']},
      {to: '/providers/accounts', labelKey: 'nav.gateway', icon: 'card', anyOf: ['providers.read']},
      {to: '/providers/webhooks', labelKey: 'nav.webhooks', icon: 'webhook', anyOf: ['webhooks.read', 'events.read']},
    ],
  },
  {
    labelKey: 'section.developers',
    items: [
      {to: '/developers/api-keys', labelKey: 'nav.apiKeys', icon: 'key', anyOf: ['api_keys.read', 'developer.read']},
      {to: '/developers/outbound-webhooks', labelKey: 'nav.outboundWebhooks', icon: 'send', anyOf: ['webhooks.read', 'developer.read', 'webhooks.manage']},
    ],
  },
  {
    labelKey: 'section.security',
    items: [
      {to: '/security/users', labelKey: 'nav.users', icon: 'team', anyOf: ['users.read']},
      {to: '/security/roles', labelKey: 'nav.roles', icon: 'lock', anyOf: ['roles.read']},
      {to: '/security/audit', labelKey: 'nav.audit', icon: 'clipboard', anyOf: ['audit.read']},
      {to: '/security/events', labelKey: 'nav.securityEvents', icon: 'alert', anyOf: ['security.read']},
      {to: '/security/errors', labelKey: 'nav.errors', icon: 'flag', anyOf: ['errors.read']},
    ],
  },
  {
    labelKey: 'section.settings',
    items: [
      {to: '/settings/organization', labelKey: 'nav.organization', icon: 'settings', anyOf: ['org.read', 'settings.read']},
    ],
  },
  {
    labelKey: 'section.finance',
    items: [
      {to: '/wallet', labelKey: 'nav.wallet', icon: 'wallet', anyOf: ['balances.read', 'reports.read', 'settlements.read']},
      {to: '/reports', labelKey: 'nav.reports', icon: 'chart', anyOf: ['reports.read', 'balances.read', 'settlements.read']},
      {to: '/refunds', labelKey: 'nav.refunds', icon: 'undo', anyOf: ['payments.refund', 'payments.manage']},
      {to: '/balances', labelKey: 'nav.balances', icon: 'scale', anyOf: ['balances.read']},
      {to: '/settlements', labelKey: 'nav.settlements', icon: 'clipboard', anyOf: ['settlements.read', 'settlements.manage']},
      {to: '/payouts', labelKey: 'nav.payouts', icon: 'send', anyOf: ['payouts.read', 'payouts.manage']},
      {to: '/disputes', labelKey: 'nav.disputes', icon: 'flag', anyOf: ['disputes.read', 'disputes.manage']},
      {to: '/risk', labelKey: 'nav.risk', icon: 'alert', anyOf: ['disputes.read', 'platform.risk.manage']},
      {to: '/ledger', labelKey: 'nav.ledger', icon: 'book', anyOf: ['balances.read']},
    ],
  },
  {
    labelKey: 'section.platform',
    items: [
      {to: '/platform/organizations', labelKey: 'nav.platformOrganizations', icon: 'globe', anyOf: ['platform.organizations.read', 'platform.admin', 'platform.support']},
      {to: '/platform/kyb', labelKey: 'nav.kybReview', icon: 'shield', anyOf: ['kyb.review', 'platform.admin']},
      {to: '/platform/bank-accounts', labelKey: 'nav.bankReview', icon: 'bank', anyOf: ['bank.review', 'platform.admin']},
      {to: '/platform/observability', labelKey: 'nav.platformObservability', icon: 'activity', anyOf: ['platform.audit_logs.read', 'platform.admin', 'platform.support']},
      {to: '/platform/webhooks', labelKey: 'nav.platformWebhooks', icon: 'webhook', anyOf: ['webhooks.manage', 'platform.admin', 'platform.support']},
      {to: '/platform/health', labelKey: 'nav.platformHealth', icon: 'heart', anyOf: ['platform.system.manage', 'platform.admin', 'platform.support']},
      {to: '/platform/team', labelKey: 'nav.platformTeam', icon: 'team', anyOf: ['platform.users.read', 'platform.admin']},
      {to: '/platform/totp-requests', labelKey: 'nav.platformTotp', icon: 'shield', anyOf: ['platform.users.manage', 'platform.admin']},
    ],
  },
  {
    labelKey: 'section.later',
    items: [
      {to: '/coming-soon/reconciliation', labelKey: 'nav.reconciliation', icon: 'clock', anyOf: ['settlements.read', 'balances.read']},
    ],
  },
];
