import {apiV1, ApiError, downloadApiV1, uploadDocumentBinary, type ApiRequestOptions} from './client';

type Tok = string | null | undefined;

const withToken = (token: Tok, extra?: ApiRequestOptions): ApiRequestOptions => ({
  ...extra,
  token: token || undefined,
});

/** Verified against apps/api/src/interfaces/http/apiV1/* */
export const v4 = {
  platformRuntime: () => apiV1<any>('/platform/runtime'),
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
  verifyEmail: (body: {token: string}) => apiV1<any>('/auth/verify-email', {method: 'POST', body}),
  resendVerification: (body: {email: string}) =>
    apiV1<any>('/auth/resend-verification', {method: 'POST', body}),
  forgotPassword: (body: {email: string}) => apiV1<any>('/auth/password/forgot', {method: 'POST', body}),
  resetPassword: (body: {token: string; password: string}) =>
    apiV1<any>('/auth/password/reset', {method: 'POST', body, idempotent: true}),
  acceptInvitation: (body: {token: string; name?: string; password?: string}) =>
    apiV1<any>('/invitations/accept', {method: 'POST', body, idempotent: true}),

  orgCurrent: (token: Tok) => apiV1<any>('/organizations/current', withToken(token)),
  updateOrgCurrent: (token: Tok, body: unknown) =>
    apiV1<any>('/organizations/current', withToken(token, {method: 'PATCH', body})),
  paymentsReadiness: (token: Tok) => apiV1<any>('/merchant/payments/readiness', withToken(token)),
  transactions: (token: Tok, query = '') => apiV1<any[]>(`/merchant/transactions${query}`, withToken(token)),
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
  addOwner: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/owners', withToken(token, {method: 'POST', body})),
  addDirector: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/directors', withToken(token, {method: 'POST', body})),
  addRepresentative: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/representatives', withToken(token, {method: 'POST', body})),
  removeOwner: (token: Tok, personId: string) =>
    apiV1<any>(`/merchant/owners/${personId}/remove`, withToken(token, {method: 'POST', body: {}})),
  removeDirector: (token: Tok, personId: string) =>
    apiV1<any>(`/merchant/directors/${personId}/remove`, withToken(token, {method: 'POST', body: {}})),
  removeRepresentative: (token: Tok, personId: string) =>
    apiV1<any>(`/merchant/representatives/${personId}/remove`, withToken(token, {method: 'POST', body: {}})),
  kyb: (token: Tok) => apiV1<any>('/merchant/kyb', withToken(token)),
  kybSubmit: (token: Tok, body: unknown = {}) =>
    apiV1<any>('/merchant/kyb/submit', withToken(token, {method: 'POST', body, idempotent: true})),
  documents: (token: Tok) => apiV1<any[]>('/merchant/documents', withToken(token)),
  createDocument: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/documents', withToken(token, {method: 'POST', body})),
  documentUploadIntent: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/documents/upload-intent', withToken(token, {method: 'POST', body})),
  uploadDocumentContent: (token: Tok, documentId: string, file: File) =>
    uploadDocumentBinary(token, documentId, file),

  // Platform admin — KYB
  adminKybCases: (token: Tok, status?: string) =>
    apiV1<any[]>(`/admin/kyb/cases${status ? `?status=${encodeURIComponent(status)}` : ''}`, withToken(token)),
  adminKybCase: (token: Tok, caseId: string) => apiV1<any>(`/admin/kyb/cases/${caseId}`, withToken(token)),
  adminKybStartReview: (token: Tok, caseId: string) =>
    apiV1<any>(`/admin/kyb/cases/${caseId}/start-review`, withToken(token, {method: 'POST', body: {}})),
  adminKybRequestInfo: (token: Tok, caseId: string, body: {reason: string}) =>
    apiV1<any>(`/admin/kyb/cases/${caseId}/request-information`, withToken(token, {method: 'POST', body})),
  adminKybDecision: (
    token: Tok,
    caseId: string,
    body: {decision: 'APPROVED' | 'REJECTED'; reason: string; stepUpToken?: string},
  ) =>
    apiV1<any>(`/admin/kyb/cases/${caseId}/decision`, {
      ...withToken(token, {method: 'POST', body: {decision: body.decision, reason: body.reason}, idempotent: true}),
      stepUpToken: body.stepUpToken,
    }),
  adminDocumentReview: (token: Tok, documentId: string, body: {decision: 'ACCEPTED' | 'REJECTED'; reason?: string}) =>
    apiV1<any>(`/admin/documents/${documentId}/review`, withToken(token, {method: 'POST', body})),
  adminBankAccounts: (token: Tok, status?: string) =>
    apiV1<any[]>(
      `/admin/bank-accounts${status ? `?status=${encodeURIComponent(status)}` : ''}`,
      withToken(token),
    ),
  adminBankAccount: (token: Tok, accountId: string) =>
    apiV1<any>(`/admin/bank-accounts/${accountId}`, withToken(token)),
  adminBankStartVerification: (token: Tok, accountId: string) =>
    apiV1<any>(`/admin/bank-accounts/${accountId}/verification/start`, withToken(token, {method: 'POST', body: {}})),
  adminBankDecision: (
    token: Tok,
    accountId: string,
    body: {result: 'PASSED' | 'FAILED'; reason: string},
    stepUpToken?: string,
  ) =>
    apiV1<any>(`/admin/bank-accounts/${accountId}/verification/decision`, {
      ...withToken(token, {method: 'POST', body, idempotent: true}),
      stepUpToken,
    }),
  adminBankActivate: (token: Tok, accountId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/admin/bank-accounts/${accountId}/activate`,
      withToken(token, {method: 'POST', body: {}, idempotent: true, stepUpToken}),
    ),
  openAdminDocument: async (token: Tok, documentId: string) => {
    const headers: Record<string, string> = {};
    if (token && token !== 'cookie-session') {
      headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    const res = await fetch(
      `${(import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/v1/admin/documents/${documentId}/content`,
      {headers, credentials: 'include'},
    );
    if (!res.ok) throw new ApiError(`Download failed (${res.status})`, {status: res.status});
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  bankAccounts: (token: Tok) => apiV1<any[]>('/merchant/bank-accounts', withToken(token)),
  createBankAccount: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/merchant/bank-accounts', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  activateBankAccount: (token: Tok, accountId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/merchant/bank-accounts/${accountId}/activate`,
      withToken(token, {method: 'POST', body: {}, idempotent: true, stepUpToken}),
    ),
  deactivateBankAccount: (token: Tok, accountId: string, reason: string | undefined, stepUpToken?: string) =>
    apiV1<any>(
      `/merchant/bank-accounts/${accountId}/deactivate`,
      withToken(token, {method: 'POST', body: {reason}, idempotent: true, stepUpToken}),
    ),
  setDefaultBankAccount: (token: Tok, accountId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/merchant/bank-accounts/${accountId}/set-default`,
      withToken(token, {method: 'POST', body: {}, stepUpToken}),
    ),
  masterData: (token: Tok, type: string) => apiV1<any[]>(`/master-data/${type}`, withToken(token)),

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
  checkoutStripeSync: (body: {payment_intent: string}) =>
    apiV1<any>('/checkout/stripe/sync', {method: 'POST', body, idempotent: true}),

  // Billing
  customers: (token: Tok) => apiV1<any[]>('/customers', withToken(token)),
  createCustomer: (token: Tok, body: unknown) =>
    apiV1<any>('/customers', withToken(token, {method: 'POST', body, idempotent: true})),
  updateCustomer: (token: Tok, id: string, body: unknown) =>
    apiV1<any>(`/customers/${id}`, withToken(token, {method: 'PATCH', body})),
  customerPayments: (token: Tok, id: string) =>
    apiV1<any[]>(`/customers/${id}/payments`, withToken(token)),
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
  createProviderRoute: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/provider-routes', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  providerWebhooks: (token: Tok) => apiV1<any[]>('/provider-webhooks', withToken(token)),
  merchantWebhookEndpoints: (token: Tok) => apiV1<any[]>('/merchant/webhook-endpoints', withToken(token)),
  createMerchantWebhookEndpoint: (token: Tok, body: unknown) =>
    apiV1<any>('/merchant/webhook-endpoints', withToken(token, {method: 'POST', body})),
  updateMerchantWebhookEndpoint: (token: Tok, id: string, body: unknown) =>
    apiV1<any>(`/merchant/webhook-endpoints/${id}`, withToken(token, {method: 'PATCH', body})),
  merchantWebhookDeliveries: (token: Tok) =>
    apiV1<any[]>('/merchant/webhook-deliveries', withToken(token)),
  retryMerchantWebhookDelivery: (token: Tok, deliveryId: string) =>
    apiV1<any>(`/merchant/webhook-deliveries/${deliveryId}/retry`, withToken(token, {method: 'POST', body: {}})),
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
  revokeInvitation: (token: Tok, orgId: string, invitationId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/organizations/${orgId}/invitations/${invitationId}/revoke`,
      withToken(token, {method: 'POST', body: {}, stepUpToken}),
    ),
  deactivateMember: (token: Tok, orgId: string, userId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/organizations/${orgId}/users/${userId}/deactivate`,
      withToken(token, {method: 'POST', body: {}, stepUpToken}),
    ),
  removeMember: (token: Tok, orgId: string, userId: string, stepUpToken?: string) =>
    apiV1<any>(
      `/organizations/${orgId}/users/${userId}/remove`,
      withToken(token, {method: 'POST', body: {}, stepUpToken}),
    ),
  requestTotpEmail: (token: Tok, body?: {reason?: string}) =>
    apiV1<any>('/auth/mfa/totp-request', withToken(token, {method: 'POST', body: body || {}})),
  platformMfaTotpRequests: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/mfa-totp-requests${query}`, withToken(token)),
  approvePlatformMfaTotpRequest: (token: Tok, requestId: string, body: unknown, stepUpToken?: string) =>
    apiV1<any>(
      `/platform/mfa-totp-requests/${requestId}/approve`,
      withToken(token, {method: 'POST', body, stepUpToken}),
    ),
  denyPlatformMfaTotpRequest: (token: Tok, requestId: string, body: unknown, stepUpToken?: string) =>
    apiV1<any>(
      `/platform/mfa-totp-requests/${requestId}/deny`,
      withToken(token, {method: 'POST', body, stepUpToken}),
    ),
  deactivatePlatformUser: (token: Tok, userId: string, stepUpToken?: string) =>
    apiV1<any>(`/platform/users/${userId}/deactivate`, withToken(token, {method: 'POST', body: {}, stepUpToken})),

  // Platform team (separate accounts, no merchant organization)
  platformUsers: (token: Tok) => apiV1<any[]>('/platform/users', withToken(token)),
  platformInvitations: (token: Tok) => apiV1<any[]>('/platform/invitations', withToken(token)),
  createPlatformInvitation: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/platform/invitations', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  revokePlatformInvitation: (token: Tok, id: string, stepUpToken?: string) =>
    apiV1<any>(`/platform/invitations/${id}/revoke`, withToken(token, {method: 'POST', body: {}, stepUpToken})),

  platformOrganizations: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/organizations${query}`, withToken(token)),
  downloadPlatformOrganizationsCsv: (token: Tok, query = '') =>
    downloadApiV1(`/platform/organizations${query}${query.includes('?') ? '&' : '?'}format=csv`, 'organizations.csv', token),
  platformOrganization: (token: Tok, organizationId: string) =>
    apiV1<any>(`/platform/organizations/${organizationId}`, withToken(token)),
  updatePlatformOrganizationStatus: (token: Tok, organizationId: string, body: unknown, stepUpToken?: string) =>
    apiV1<any>(`/platform/organizations/${organizationId}/status`, withToken(token, {method: 'PATCH', body, stepUpToken})),
  updatePlatformOrganizationSettings: (token: Tok, organizationId: string, body: unknown) =>
    apiV1<any>(`/platform/organizations/${organizationId}/settings`, withToken(token, {method: 'PATCH', body})),
  platformOrganizationPayments: (token: Tok, organizationId: string, query = '') =>
    apiV1<any[]>(`/platform/organizations/${organizationId}/payments${query}`, withToken(token)),
  downloadPlatformOrganizationPaymentsCsv: (token: Tok, organizationId: string) =>
    downloadApiV1(`/platform/organizations/${organizationId}/payments?format=csv`, `payments-${organizationId}.csv`, token),
  platformWebhookDeliveries: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/webhook-deliveries${query}`, withToken(token)),
  retryPlatformWebhookDelivery: (token: Tok, deliveryId: string) =>
    apiV1<any>(`/platform/webhook-deliveries/${deliveryId}/retry`, withToken(token, {method: 'POST', body: {}})),
  retryFailedPlatformWebhooks: (token: Tok, body: {organization_id?: string} = {}) =>
    apiV1<any>('/platform/webhook-deliveries/retry-failed', withToken(token, {method: 'POST', body})),
  platformSystemHealth: (token: Tok) => apiV1<any>('/platform/system/health', withToken(token)),
  platformAuditEvents: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/audit-events${query}`, withToken(token)),
  downloadPlatformAuditCsv: (token: Tok, query = '') =>
    downloadApiV1(`/platform/audit-events${query}${query.includes('?') ? '&' : '?'}format=csv`, 'audit-events.csv', token),
  platformSecurityEvents: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/security-events${query}`, withToken(token)),
  platformErrorReports: (token: Tok, query = '') =>
    apiV1<any[]>(`/platform/error-reports${query}`, withToken(token)),

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
  financeStatement: (token: Tok, query = '') =>
    apiV1<any>(`/merchant/finance/statement${query}`, withToken(token)),
  downloadFinanceStatementCsv: (token: Tok, query = '') =>
    downloadApiV1(
      `/merchant/finance/statement${query}${query.includes('?') ? '&' : '?'}format=csv`,
      'statement.csv',
      token,
    ),
  paymentFees: (token: Tok, id: string) => apiV1<any>(`/payments/${id}/fees`, withToken(token)),
  createMerchantProviderAccount: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/merchant/provider-accounts', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  ledgerAccounts: (token: Tok) => apiV1<any[]>('/ledger/accounts', withToken(token)),
  ledgerEntries: (token: Tok) => apiV1<any[]>('/ledger/entries', withToken(token)),
  settlements: (token: Tok) => apiV1<any[]>('/settlements', withToken(token)),
  createSettlement: (token: Tok, body: unknown) =>
    apiV1<any>('/settlements', withToken(token, {method: 'POST', body, idempotent: true})),
  payouts: (token: Tok) => apiV1<any[]>('/payouts', withToken(token)),
  createPayout: (token: Tok, body: unknown, stepUpToken?: string) =>
    apiV1<any>('/payouts', withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  approvePayout: (token: Tok, id: string, body: {external_evidence_ref: string}, stepUpToken?: string) =>
    apiV1<any>(`/payouts/${id}/approve`, withToken(token, {method: 'POST', body, idempotent: true, stepUpToken})),
  reconciliationRuns: (token: Tok) => apiV1<any[]>('/reconciliation/runs', withToken(token)),
  runReconciliation: (token: Tok) =>
    apiV1<any>('/reconciliation/runs', withToken(token, {method: 'POST', body: {}})),
  riskSignals: (token: Tok) => apiV1<any[]>('/risk/signals', withToken(token)),
  disputes: (token: Tok) => apiV1<any[]>('/disputes', withToken(token)),
  providerCapabilityProfile: (token: Tok, code: string) =>
    apiV1<any>(`/providers/${code}/capability-profile`, withToken(token)),
  booksSyncState: (token: Tok) => apiV1<any[]>('/books/sync-state', withToken(token)),
};
