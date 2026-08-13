import React from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {AppShell} from '../layouts';
import {LoadingState} from '../design-system/components';
import {LoginPage} from '../pages/LoginPage';
import {SignupPage} from '../pages/SignupPage';
import {OnboardingWizardPage} from '../pages/OnboardingWizardPage';
import {OnboardingGate} from '../components/OnboardingGate';
import {DashboardPage} from '../pages/DashboardPage';
import {PaymentConfigPage} from '../pages/PaymentConfigPage';
import {PaymentLinksPage} from '../pages/PaymentLinksPage';
import {PaymentLinkDetailPage} from '../pages/PaymentLinkDetailPage';
import {PaymentsPage} from '../pages/PaymentsPage';
import {PaymentDetailPage} from '../pages/PaymentDetailPage';
import {CheckoutPage} from '../public-checkout/CheckoutPage';
import {
  AcceptInvitationPage,
  CheckoutReturnPage,
  ForgotPasswordPage,
  ResendVerificationPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from '../pages/AuthPublicPages';
import {CustomersPage} from '../pages/billing/CustomersPage';
import {MerchantProfilePage} from '../pages/merchant/MerchantProfilePage';
import {BusinessPage} from '../pages/merchant/BusinessPage';
import {PeoplePage} from '../pages/merchant/PeoplePage';
import {DocumentsPage} from '../pages/merchant/DocumentsPage';
import {KybPage} from '../pages/merchant/KybPage';
import {BankAccountsPage} from '../pages/merchant/BankAccountsPage';
import {TransactionsPage} from '../pages/TransactionsPage';
import {ProvidersPage} from '../pages/providers/ProvidersPage';
import {ProviderAccountsPage} from '../pages/providers/ProviderAccountsPage';
import {WebhooksPage} from '../pages/providers/WebhooksPage';
import {ApiKeysPage} from '../pages/developers/ApiKeysPage';
import {OutboundWebhooksPage} from '../pages/developers/OutboundWebhooksPage';
import {
  AppearancePage,
  AuditPage,
  ErrorsPage,
  OrganizationPage,
  RolesPage,
  SecurityEventsPage,
  UsersPage,
} from '../pages/security/SecurityPages';
import {
  PlatformOrganizationDetailPage,
  PlatformOrganizationsPage,
  PlatformObservabilityPage,
} from '../pages/platform/PlatformOrganizationsPages';
import {
  PlatformKybDetailPage,
  PlatformKybListPage,
} from '../pages/platform/PlatformKybPages';
import {PlatformBankDetailPage, PlatformBankListPage} from '../pages/platform/PlatformBankPages';
import {PlatformTeamPage} from '../pages/platform/PlatformTeamPage';
import {PlatformTotpRequestsPage} from '../pages/platform/PlatformTotpRequestsPage';
import {PlatformSystemHealthPage} from '../pages/platform/PlatformSystemHealthPage';
import {PlatformWebhooksPage} from '../pages/platform/PlatformWebhooksPage';
import {ComingSoonPage} from '../pages/ComingSoonPage';
import {ForbiddenPage} from '../pages/ForbiddenPage';
import {RequirePermission} from '../rbac/RequirePermission';
import {
  BalancesPage,
  DisputesPage,
  PayoutsPage,
  RefundsPage,
  RiskPage,
  SettlementsPage,
} from '../pages/finance/FinancePages';
import {WalletPage} from '../pages/finance/WalletPage';
import {ReportsPage} from '../pages/finance/ReportsPage';
import {LedgerPage} from '../pages/finance/LedgerPage';

function RequireAuth({children}: {children: React.ReactNode}) {
  const {token, loading} = useAuth();
  if (loading) return <LoadingState label="Restoring session…" />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RP({anyOf, children}: {anyOf: string[]; children: React.ReactNode}) {
  return <RequirePermission anyOf={anyOf}>{children}</RequirePermission>;
}

/** Home ('/') sends platform team accounts to the platform workspace; merchants see the dashboard. */
function HomeRedirect() {
  const {isPlatform} = useAuth();
  if (isPlatform) return <Navigate to="/platform/organizations" replace />;
  return (
    <RP anyOf={['payments.read', 'org.read', 'billing.read', 'platform.admin', 'platform.support']}>
      <DashboardPage />
    </RP>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingWizardPage />
          </RequireAuth>
        }
      />
      <Route path="/checkout/return" element={<CheckoutReturnPage />} />
      <Route path="/checkout/:token" element={<CheckoutPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/resend-verification" element={<ResendVerificationPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <OnboardingGate>
              <AppShell />
            </OnboardingGate>
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="payment-config" element={<RP anyOf={['payment_config.read']}><PaymentConfigPage /></RP>} />
        <Route path="payment-links" element={<RP anyOf={['payment_links.read']}><PaymentLinksPage /></RP>} />
        <Route path="payment-links/:id" element={<RP anyOf={['payment_links.read']}><PaymentLinkDetailPage /></RP>} />
        <Route path="payments" element={<RP anyOf={['payments.read']}><PaymentsPage /></RP>} />
        <Route path="payments/:id" element={<RP anyOf={['payments.read']}><PaymentDetailPage /></RP>} />
        <Route path="transactions" element={<RP anyOf={['payments.read']}><TransactionsPage /></RP>} />
        <Route path="customers" element={<RP anyOf={['customers.read', 'billing.read', 'billing.manage']}><CustomersPage /></RP>} />
        <Route path="customers/:id" element={<RP anyOf={['customers.read', 'billing.read', 'billing.manage']}><CustomersPage /></RP>} />
        {/* Books owns catalog/invoicing — redirect legacy billing URLs away from the console */}
        <Route path="products" element={<Navigate to="/customers" replace />} />
        <Route path="prices" element={<Navigate to="/customers" replace />} />
        <Route path="subscriptions" element={<Navigate to="/payment-links" replace />} />
        <Route path="subscriptions/:id" element={<Navigate to="/payment-links" replace />} />
        <Route path="invoices" element={<Navigate to="/payment-links" replace />} />
        <Route path="invoices/:id" element={<Navigate to="/payment-links" replace />} />
        <Route path="merchant/profile" element={<RP anyOf={['merchant.read']}><MerchantProfilePage /></RP>} />
        <Route path="merchant/business" element={<RP anyOf={['merchant.read']}><BusinessPage /></RP>} />
        <Route path="merchant/people" element={<RP anyOf={['merchant.read']}><PeoplePage /></RP>} />
        <Route path="merchant/kyb" element={<RP anyOf={['kyb.read']}><KybPage /></RP>} />
        <Route path="merchant/documents" element={<RP anyOf={['documents.read']}><DocumentsPage /></RP>} />
        <Route path="merchant/bank-accounts" element={<RP anyOf={['bank.read']}><BankAccountsPage /></RP>} />
        <Route path="providers" element={<RP anyOf={['providers.read', 'developer.read']}><ProvidersPage /></RP>} />
        <Route path="providers/accounts" element={<RP anyOf={['providers.read']}><ProviderAccountsPage /></RP>} />
        <Route path="providers/webhooks" element={<RP anyOf={['webhooks.read', 'events.read']}><WebhooksPage /></RP>} />
        <Route path="developers/api-keys" element={<RP anyOf={['api_keys.read', 'developer.read']}><ApiKeysPage /></RP>} />
        <Route path="developers/outbound-webhooks" element={<RP anyOf={['webhooks.read', 'webhooks.manage', 'developer.read']}><OutboundWebhooksPage /></RP>} />
        <Route path="security/users" element={<RP anyOf={['users.read']}><UsersPage /></RP>} />
        <Route path="security/roles" element={<RP anyOf={['roles.read']}><RolesPage /></RP>} />
        <Route path="security/audit" element={<RP anyOf={['audit.read']}><AuditPage /></RP>} />
        <Route path="security/events" element={<RP anyOf={['security.read']}><SecurityEventsPage /></RP>} />
        <Route path="security/errors" element={<RP anyOf={['errors.read']}><ErrorsPage /></RP>} />
        <Route path="settings/organization" element={<RP anyOf={['org.read', 'settings.read']}><OrganizationPage /></RP>} />
        <Route path="settings/appearance" element={<AppearancePage />} />
        <Route path="refunds" element={<RP anyOf={['payments.refund', 'payments.manage']}><RefundsPage /></RP>} />
        <Route path="wallet" element={<RP anyOf={['balances.read', 'reports.read', 'settlements.read']}><WalletPage /></RP>} />
        <Route path="reports" element={<RP anyOf={['reports.read', 'balances.read', 'settlements.read']}><ReportsPage /></RP>} />
        <Route path="ledger" element={<RP anyOf={['balances.read']}><LedgerPage /></RP>} />
        <Route path="balances" element={<RP anyOf={['balances.read']}><BalancesPage /></RP>} />
        <Route path="settlements" element={<RP anyOf={['settlements.read', 'settlements.manage']}><SettlementsPage /></RP>} />
        <Route path="payouts" element={<RP anyOf={['payouts.read', 'payouts.manage']}><PayoutsPage /></RP>} />
        <Route path="disputes" element={<RP anyOf={['disputes.read', 'disputes.manage']}><DisputesPage /></RP>} />
        <Route path="risk" element={<RP anyOf={['disputes.read', 'platform.risk.manage']}><RiskPage /></RP>} />
        <Route path="platform" element={<Navigate to="/platform/organizations" replace />} />
        <Route path="platform/organizations" element={<RP anyOf={['platform.organizations.read', 'platform.admin', 'platform.support']}><PlatformOrganizationsPage /></RP>} />
        <Route path="platform/organizations/:organizationId" element={<RP anyOf={['platform.organizations.read', 'platform.admin', 'platform.support']}><PlatformOrganizationDetailPage /></RP>} />
        <Route path="platform/observability" element={<RP anyOf={['platform.audit_logs.read', 'platform.admin', 'platform.support']}><PlatformObservabilityPage /></RP>} />
        <Route path="platform/webhooks" element={<RP anyOf={['webhooks.manage', 'platform.admin', 'platform.support']}><PlatformWebhooksPage /></RP>} />
        <Route path="platform/health" element={<RP anyOf={['platform.system.manage', 'platform.admin', 'platform.support']}><PlatformSystemHealthPage /></RP>} />
        <Route path="platform/team" element={<RP anyOf={['platform.users.read', 'platform.admin']}><PlatformTeamPage /></RP>} />
        <Route path="platform/totp-requests" element={<RP anyOf={['platform.users.manage', 'platform.admin']}><PlatformTotpRequestsPage /></RP>} />
        <Route path="platform/kyb" element={<RP anyOf={['kyb.review', 'platform.admin']}><PlatformKybListPage /></RP>} />
        <Route path="platform/kyb/:caseId" element={<RP anyOf={['kyb.review', 'platform.admin']}><PlatformKybDetailPage /></RP>} />
        <Route path="platform/bank-accounts" element={<RP anyOf={['bank.review', 'platform.admin']}><PlatformBankListPage /></RP>} />
        <Route path="platform/bank-accounts/:accountId" element={<RP anyOf={['bank.review', 'platform.admin']}><PlatformBankDetailPage /></RP>} />
        <Route path="coming-soon/reports" element={<Navigate to="/reports" replace />} />
        <Route path="coming-soon/ledger" element={<Navigate to="/ledger" replace />} />
        <Route path="coming-soon/:feature" element={<ComingSoonPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
