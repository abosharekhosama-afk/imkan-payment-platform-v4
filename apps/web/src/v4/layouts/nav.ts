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

/** Permission-aware console navigation — Imkan One module grouping. */
export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: 'section.workspace',
    items: [
      {to: '/', labelKey: 'nav.dashboard', icon: 'home', anyOf: ['payments.read', 'org.read', 'billing.read']},
      {to: '/payments', labelKey: 'nav.payments', icon: 'card', anyOf: ['payments.read']},
      {to: '/payment-links', labelKey: 'nav.paymentLinks', icon: 'link', anyOf: ['payment_links.read']},
      {to: '/transactions', labelKey: 'nav.transactions', icon: 'list', anyOf: ['payments.read']},
    ],
  },
  {
    labelKey: 'section.business',
    items: [
      {to: '/merchant/profile', labelKey: 'nav.onboardingKyb', icon: 'shield', anyOf: ['merchant.read', 'kyb.read']},
      {to: '/merchant/bank-accounts', labelKey: 'nav.bankAccounts', icon: 'bank', anyOf: ['bank.read']},
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
    ],
  },
  {
    labelKey: 'section.settings',
    items: [
      {to: '/settings/organization', labelKey: 'nav.settings', icon: 'settings', anyOf: ['org.read', 'settings.read', 'payment_config.read']},
      {to: '/security/users', labelKey: 'nav.users', icon: 'team', anyOf: ['users.read']},
      {to: '/security/roles', labelKey: 'nav.roles', icon: 'lock', anyOf: ['roles.read']},
      {
        to: '/security/logs',
        labelKey: 'nav.securityLogs',
        icon: 'clipboard',
        anyOf: ['audit.read', 'security.read', 'errors.read'],
      },
      {to: '/providers', labelKey: 'nav.providers', icon: 'plug', anyOf: ['providers.read', 'developer.read']},
      {to: '/providers/accounts', labelKey: 'nav.gateway', icon: 'card', anyOf: ['providers.read']},
    ],
  },
  {
    labelKey: 'section.platform',
    items: [
      {to: '/platform/organizations', labelKey: 'nav.platformOrganizations', icon: 'globe', anyOf: ['platform.organizations.read', 'platform.admin', 'platform.support']},
      {to: '/platform/commissions', labelKey: 'nav.commissions', icon: 'percent', anyOf: ['platform.admin', 'platform.finance']},
      {to: '/platform/kyb', labelKey: 'nav.kybReview', icon: 'shield', anyOf: ['kyb.review', 'platform.admin']},
      {to: '/platform/bank-accounts', labelKey: 'nav.bankReview', icon: 'bank', anyOf: ['bank.review', 'platform.admin']},
      {to: '/platform/observability', labelKey: 'nav.platformObservability', icon: 'activity', anyOf: ['platform.audit_logs.read', 'platform.admin', 'platform.support']},
      {to: '/platform/webhooks', labelKey: 'nav.platformWebhooks', icon: 'webhook', anyOf: ['webhooks.manage', 'platform.admin', 'platform.support']},
      {to: '/platform/health', labelKey: 'nav.platformHealth', icon: 'heart', anyOf: ['platform.system.manage', 'platform.admin']},
      {to: '/platform/team', labelKey: 'nav.platformTeam', icon: 'team', anyOf: ['platform.users.read', 'platform.admin']},
      {to: '/platform/totp-requests', labelKey: 'nav.platformTotp', icon: 'shield', anyOf: ['platform.users.manage', 'platform.admin']},
    ],
  },
];
