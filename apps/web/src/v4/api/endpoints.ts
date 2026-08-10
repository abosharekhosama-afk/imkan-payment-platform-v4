import {apiV1, type ApiRequestOptions} from './client';

type Tok = string | null | undefined;

const withToken = (token: Tok, extra?: ApiRequestOptions): ApiRequestOptions => ({
  ...extra,
  token: token || undefined,
});

/** Verified against apps/api/src/interfaces/http/apiV1/* */
export const v4 = {
  // Auth
  register: (body: {
    email: string;
    password: string;
    name?: string;
    organization_name: string;
    country_code?: string;
  }) => apiV1<any>('/auth/register', {method: 'POST', body}),
  login: (body: {email: string; password: string; organization_id?: string}) =>
    apiV1<any>('/auth/login', {method: 'POST', body}),
  mfaVerify: (body: {mfa_token: string; totp: string}) =>
    apiV1<any>('/auth/mfa/verify', {method: 'POST', body}),
  me: (token: Tok) => apiV1<any>('/auth/me', withToken(token)),
  logout: (token: Tok) => apiV1<any>('/auth/logout', withToken(token, {method: 'POST', body: {}})),

  orgCurrent: (token: Tok) => apiV1<any>('/organizations/current', withToken(token)),
  members: (token: Tok, orgId: string) =>
    apiV1<any[]>(`/organizations/${orgId}/members`, withToken(token)),
  auditEvents: (token: Tok) => apiV1<any[]>('/audit-events', withToken(token)),
  securityEvents: (token: Tok) => apiV1<any[]>('/security-events', withToken(token)),
  errorReports: (token: Tok) => apiV1<any[]>('/error-reports', withToken(token)),

  // Merchant
  merchantProfile: (token: Tok) => apiV1<any>('/merchant/profile', withToken(token)),
  putMerchantProfile: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/profile', withToken(token, {method: 'PUT', body})),
  putLegalProfile: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/legal-profile', withToken(token, {method: 'PUT', body})),
  putBusinessProfile: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/business-profile', withToken(token, {method: 'PUT', body})),
  kyb: (token: Tok) => apiV1<any>('/merchant/kyb', withToken(token)),
  kybSubmit: (token: Tok, body: unknown = {}) =>
    apiV1<any>('/merchant/kyb/submit', withToken(token, {method: 'POST', body, idempotent: true})),
  documents: (token: Tok) => apiV1<any[]>('/merchant/documents', withToken(token)),
  bankAccounts: (token: Tok) => apiV1<any[]>('/merchant/bank-accounts', withToken(token)),

  // Payments
  dashboardSummary: (token: Tok) => apiV1<any>('/merchant/dashboard/summary', withToken(token)),
  paymentConfig: (token: Tok) => apiV1<any>('/merchant/payment-config', withToken(token)),
  putPaymentConfig: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/payment-config', withToken(token, {method: 'PUT', body})),
  paymentLinks: (token: Tok, q = '') =>
    apiV1<any[]>(`/merchant/payment-links${q}`, withToken(token)),
  paymentLink: (token: Tok, id: string) =>
    apiV1<any>(`/merchant/payment-links/${id}`, withToken(token)),
  createPaymentLink: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/payment-links', withToken(token, {method: 'POST', body, idempotent: true})),
  patchPaymentLink: (token: Tok, id: string, body: unknown) =>
    apiV1<any>(`/merchant/payment-links/${id}`, withToken(token, {method: 'PATCH', body})),
  paymentLinkAction: (token: Tok, id: string, action: string) =>
    apiV1<any>(`/merchant/payment-links/${id}/${action}`, withToken(token, {method: 'POST', body: {}})),
  payments: (token: Tok, q = '') => apiV1<any[]>(`/merchant/payments${q}`, withToken(token)),
  payment: (token: Tok, id: string) => apiV1<any>(`/merchant/payments/${id}`, withToken(token)),
  cancelPayment: (token: Tok, id: string) =>
    apiV1<any>(`/merchant/payments/${id}/cancel`, withToken(token, {method: 'POST', body: {}, idempotent: true})),

  // Public checkout
  checkoutPage: (publicToken: string) => apiV1<any>(`/checkout/${publicToken}`),
  checkoutSession: (publicToken: string, body: unknown) =>
    apiV1<any>(`/checkout/${publicToken}/session`, {method: 'POST', body, idempotent: true}),
  checkoutPay: (publicToken: string, body: unknown) =>
    apiV1<any>(`/checkout/${publicToken}/payment`, {method: 'POST', body, idempotent: true}),

  // Billing
  customers: (token: Tok) => apiV1<any[]>('/customers', withToken(token)),
  createCustomer: (token: Tok, body: unknown) =>
    apiV1<any>('/customers', withToken(token, {method: 'POST', body, idempotent: true})),
  products: (token: Tok) => apiV1<any[]>('/products', withToken(token)),
  createProduct: (token: Tok, body: unknown) =>
    apiV1<any>('/products', withToken(token, {method: 'POST', body, idempotent: true})),
  prices: (token: Tok) => apiV1<any[]>('/prices', withToken(token)),
  createPrice: (token: Tok, body: unknown) =>
    apiV1<any>('/prices', withToken(token, {method: 'POST', body, idempotent: true})),
  subscriptions: (token: Tok) => apiV1<any[]>('/subscriptions', withToken(token)),
  createSubscription: (token: Tok, body: unknown) =>
    apiV1<any>('/subscriptions', withToken(token, {method: 'POST', body, idempotent: true})),
  subscriptionAction: (token: Tok, id: string, action: 'pause' | 'resume' | 'cancel') =>
    apiV1<any>(`/subscriptions/${id}/${action}`, withToken(token, {method: 'POST', body: {}, idempotent: true})),
  invoices: (token: Tok) => apiV1<any[]>('/invoices', withToken(token)),
  invoice: (token: Tok, id: string) => apiV1<any>(`/invoices/${id}`, withToken(token)),
  collectInvoice: (token: Tok, id: string, stepUpToken?: string) =>
    apiV1<any>(
      `/invoices/${id}/collect`,
      withToken(token, {method: 'POST', body: {}, idempotent: true, stepUpToken}),
    ),
  runRenewals: (token: Tok, stepUpToken?: string) =>
    apiV1<any>(
      '/billing/renewals/run',
      withToken(token, {method: 'POST', body: {}, idempotent: true, stepUpToken}),
    ),

  // Providers / developers
  providers: (token: Tok) => apiV1<any[]>('/providers', withToken(token)),
  providerCapabilities: (token: Tok, code: string) =>
    apiV1<any[]>(`/providers/${code}/capabilities`, withToken(token)),
  providerAccounts: (token: Tok) => apiV1<any[]>('/provider-accounts', withToken(token)),
  providerRoutes: (token: Tok) => apiV1<any[]>('/provider-routes', withToken(token)),
  providerWebhooks: (token: Tok) => apiV1<any[]>('/provider-webhooks', withToken(token)),
  apiKeys: (token: Tok) => apiV1<any[]>('/api-keys', withToken(token)),
  enableMfa: (token: Tok) => apiV1<any>('/auth/mfa/enable', withToken(token, {method: 'POST', body: {}})),
  stepUp: (token: Tok, totp: string) =>
    apiV1<any>('/auth/mfa/step-up', withToken(token, {method: 'POST', body: {totp}})),
  createApiKey: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/api-keys', withToken(token, {method: 'POST', body, stepUpToken})),
  revokeApiKey: (token: Tok, id: string, stepUpToken?: string) =>
    apiV1<any>(`/api-keys/${id}/revoke`, withToken(token, {method: 'POST', body: {}, stepUpToken})),

  // Invites
  invitations: (token: Tok, orgId: string) =>
    apiV1<any[]>(`/organizations/${orgId}/invitations`, withToken(token)),
  createInvitation: (token: Tok, orgId: string, body: unknown, stepUpToken?: string) =>
    apiV1<any>(
      `/organizations/${orgId}/invitations`,
      withToken(token, {method: 'POST', body, idempotent: true, stepUpToken}),
    ),

  // RBAC / custom roles (Phase 6.6)
  rbacRoles: (token: Tok) => apiV1<any>('/rbac/roles', withToken(token)),
  rbacPermissions: (token: Tok) => apiV1<any[]>('/rbac/permissions', withToken(token)),
  createCustomRole: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/rbac/roles', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  deleteCustomRole: (token: Tok, roleId: string, stepUpToken?: string) =>
    apiV1<any>(`/rbac/roles/${roleId}`, withToken(token, {method: 'DELETE', stepUpToken})),

  // Finance (P6–P10)
  refunds: (token: Tok) => apiV1<any[]>('/refunds', withToken(token)),
  createRefund: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/refunds', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  balances: (token: Tok) => apiV1<any>('/balances', withToken(token)),
  ledgerAccounts: (token: Tok) => apiV1<any[]>('/ledger/accounts', withToken(token)),
  ledgerEntries: (token: Tok) => apiV1<any[]>('/ledger/entries', withToken(token)),
  settlements: (token: Tok) => apiV1<any[]>('/settlements', withToken(token)),
  createSettlement: (token: Tok, body: unknown) =>
    apiV1<any>('/settlements', withToken(token, {method: 'POST', body, idempotent: true})),
  payouts: (token: Tok) => apiV1<any[]>('/payouts', withToken(token)),
  createPayout: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/payouts', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  reconciliationRuns: (token: Tok) => apiV1<any[]>('/reconciliation/runs', withToken(token)),
  runReconciliation: (token: Tok) =>
    apiV1<any>('/reconciliation/runs', withToken(token, {method: 'POST', body: {}})),
  riskSignals: (token: Tok) => apiV1<any[]>('/risk/signals', withToken(token)),
  disputes: (token: Tok) => apiV1<any[]>('/disputes', withToken(token)),
  providerCapabilityProfile: (token: Tok, code: string) =>
    apiV1<any>(`/providers/${code}/capability-profile`, withToken(token)),
  booksSyncState: (token: Tok) => apiV1<any[]>('/books/sync-state', withToken(token)),
};
