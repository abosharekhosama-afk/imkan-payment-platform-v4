import React from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {AppShell} from '../layouts';
import {AccountAccessPage} from '../pages/AccountAccessPage';
import {ImkanLoader} from '../components/ImkanLoader';
import {LoginPage} from '../pages/LoginPage';
import {SignupPage} from '../pages/SignupPage';
import {OnboardingWizardPage} from '../pages/OnboardingWizardPage';
import {SettingsHubPage} from '../pages/settings/SettingsHubPage';
import {UnifiedWebhooksPage} from '../pages/settings/UnifiedWebhooksPage';
import {MerchantHubPage} from '../pages/merchant/MerchantHubPage';
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
import {MerchantProfilePage} from '../pages/merchant/MerchantProfilePage';
import {BusinessPage} from '../pages/merchant/BusinessPage';
import {PeoplePage} from '../pages/merchant/PeoplePage';
import {DocumentsPage} from '../pages/merchant/DocumentsPage';
import {KybPage} from '../pages/merchant/KybPage';
import {BankAccountsPage} from '../pages/merchant/BankAccountsPage';
import {TransactionsPage} from '../pages/TransactionsPage';
import {ProvidersPage} from '../pages/providers/ProvidersPage';
import {ProviderAccountsPage} from '../pages/providers/ProviderAccountsPage';
import {ApiKeysPage} from '../pages/developers/ApiKeysPage';
import {
  AppearancePage,
  AuditPage,
  ErrorsPage,
  OrganizationPage,
  RolesPage,
  SecurityEventsPage,
  SecurityLogsHubPage,
  SecurityLogsIndex,
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
  FeeSchedulesPage,
  PayoutsPage,
  RefundsPage,
  RiskPage,
  SettlementsPage,
} from '../pages/finance/FinancePages';
import {WalletPage} from '../pages/finance/WalletPage';
import {ReportsPage} from '../pages/finance/ReportsPage';

function RequireAuth({children}: {children: React.ReactNode}) {
  const {token, loading} = useAuth();
  if (loading) return <ImkanLoader overlay label="Restoring session…" />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RP({anyOf, children}: {anyOf: string[]; children: React.ReactNode}) {
  return <RequirePermission anyOf={anyOf}>{children}</RequirePermission>;
}

function MerchantOnly({children}: {children: React.ReactNode}) {
  const {isPlatform} = useAuth();
  if (isPlatform) return <Navigate to="/settings/appearance" replace />;
  return <>{children}</>;
}

function SettingsIndex() {
  const {isPlatform} = useAuth();
  return <Navigate to={isPlatform ? 'appearance' : 'organization'} replace />;
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
      <Route path="/account-access" element={<AccountAccessPage />} />
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
        <Route path="payment-config" element={<Navigate to="/settings/payments" replace />} />
        <Route path="payment-links" element={<RP anyOf={['payment_links.read']}><PaymentLinksPage /></RP>} />
        <Route path="payment-links/:id" element={<RP anyOf={['payment_links.read']}><PaymentLinkDetailPage /></RP>} />
        <Route path="payments" element={<RP anyOf={['payments.read']}><PaymentsPage /></RP>} />
        <Route path="payments/:id" element={<RP anyOf={['payments.read']}><PaymentDetailPage /></RP>} />
        <Route path="transactions" element={<RP anyOf={['payments.read']}><TransactionsPage /></RP>} />
        <Route path="customers" element={<Navigate to="/" replace />} />
        <Route path="customers/:id" element={<Navigate to="/" replace />} />
        <Route path="products" element={<Navigate to="/" replace />} />
        <Route path="prices" element={<Navigate to="/" replace />} />
        <Route path="subscriptions" element={<Navigate to="/payment-links" replace />} />
        <Route path="subscriptions/:id" element={<Navigate to="/payment-links" replace />} />
        <Route path="invoices" element={<Navigate to="/payment-links" replace />} />
        <Route path="invoices/:id" element={<Navigate to="/payment-links" replace />} />
        <Route path="merchant" element={<RP anyOf={['merchant.read', 'kyb.read']}><MerchantHubPage /></RP>}>
          <Route index element={<Navigate to="profile" replace />} />
          <Route path="profile" element={<RP anyOf={['merchant.read']}><MerchantProfilePage /></RP>} />
          <Route path="business" element={<RP anyOf={['merchant.read']}><BusinessPage /></RP>} />
          <Route path="people" element={<RP anyOf={['merchant.read']}><PeoplePage /></RP>} />
          <Route path="kyb" element={<RP anyOf={['kyb.read']}><KybPage /></RP>} />
          <Route path="documents" element={<RP anyOf={['documents.read']}><DocumentsPage /></RP>} />
        </Route>
        <Route path="merchant/bank-accounts" element={<RP anyOf={['bank.read']}><BankAccountsPage /></RP>} />
        <Route path="providers" element={<RP anyOf={['providers.read', 'developer.read']}><ProvidersPage /></RP>} />
        <Route path="providers/accounts" element={<RP anyOf={['providers.read']}><ProviderAccountsPage /></RP>} />
        <Route path="providers/webhooks" element={<Navigate to="/settings/webhooks" replace />} />
        <Route path="developers/api-keys" element={<RP anyOf={['api_keys.read', 'developer.read']}><ApiKeysPage /></RP>} />
        <Route path="developers/outbound-webhooks" element={<Navigate to="/settings/webhooks" replace />} />
        <Route path="security/users" element={<RP anyOf={['users.read']}><UsersPage /></RP>} />
        <Route path="security/roles" element={<RP anyOf={['roles.read']}><RolesPage /></RP>} />
        <Route path="security/audit" element={<Navigate to="/security/logs/audit" replace />} />
        <Route path="security/events" element={<Navigate to="/security/logs/events" replace />} />
        <Route path="security/errors" element={<Navigate to="/security/logs/errors" replace />} />
        <Route
          path="security/logs"
          element={
            <RP anyOf={['audit.read', 'security.read', 'errors.read']}>
              <SecurityLogsHubPage />
            </RP>
          }
        >
          <Route index element={<SecurityLogsIndex />} />
          <Route path="audit" element={<RP anyOf={['audit.read']}><AuditPage /></RP>} />
          <Route path="events" element={<RP anyOf={['security.read']}><SecurityEventsPage /></RP>} />
          <Route path="errors" element={<RP anyOf={['errors.read']}><ErrorsPage /></RP>} />
        </Route>
        <Route path="settings" element={<SettingsHubPage />}>
          <Route index element={<SettingsIndex />} />
          <Route
            path="organization"
            element={
              <MerchantOnly>
                <RP anyOf={['org.read', 'settings.read']}>
                  <OrganizationPage />
                </RP>
              </MerchantOnly>
            }
          />
          <Route
            path="payments"
            element={
              <MerchantOnly>
                <RP anyOf={['payment_config.read']}>
                  <PaymentConfigPage />
                </RP>
              </MerchantOnly>
            }
          />
          <Route path="appearance" element={<AppearancePage />} />
          <Route
            path="webhooks"
            element={
              <MerchantOnly>
                <RP anyOf={['webhooks.read', 'webhooks.manage', 'events.read', 'developer.read']}>
                  <UnifiedWebhooksPage />
                </RP>
              </MerchantOnly>
            }
          />
        </Route>
        <Route path="refunds" element={<RP anyOf={['payments.refund', 'payments.manage']}><RefundsPage /></RP>} />
        <Route path="wallet" element={<RP anyOf={['balances.read', 'reports.read', 'settlements.read']}><WalletPage /></RP>} />
        <Route path="reports" element={<RP anyOf={['reports.read', 'balances.read', 'settlements.read']}><ReportsPage /></RP>} />
        <Route path="ledger" element={<Navigate to="/wallet" replace />} />
        <Route path="balances" element={<RP anyOf={['balances.read']}><BalancesPage /></RP>} />
        <Route path="settlements" element={<RP anyOf={['settlements.read', 'settlements.manage']}><SettlementsPage /></RP>} />
        <Route path="fees" element={<Navigate to="/platform/commissions" replace />} />
        <Route path="payouts" element={<RP anyOf={['payouts.read', 'payouts.manage']}><PayoutsPage /></RP>} />
        <Route path="disputes" element={<RP anyOf={['disputes.read', 'disputes.manage']}><DisputesPage /></RP>} />
        <Route path="risk" element={<RP anyOf={['disputes.read', 'platform.risk.manage']}><RiskPage /></RP>} />
        <Route path="platform" element={<Navigate to="/platform/organizations" replace />} />
        <Route path="platform/commissions" element={<RP anyOf={['platform.admin', 'platform.finance']}><FeeSchedulesPage /></RP>} />
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
        <Route path="coming-soon/ledger" element={<Navigate to="/wallet" replace />} />
        <Route path="coming-soon/reconciliation" element={<Navigate to="/" replace />} />
        <Route path="coming-soon/:feature" element={<ComingSoonPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
