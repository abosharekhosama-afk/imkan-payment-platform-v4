import React from 'react';
import {Navigate, Route, Routes} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {AppShell} from '../layouts/AppShell';
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
import {CustomersPage} from '../pages/billing/CustomersPage';
import {ProductsPage} from '../pages/billing/ProductsPage';
import {PricesPage} from '../pages/billing/PricesPage';
import {SubscriptionsPage} from '../pages/billing/SubscriptionsPage';
import {SubscriptionDetailPage} from '../pages/billing/SubscriptionDetailPage';
import {InvoicesPage} from '../pages/billing/InvoicesPage';
import {InvoiceDetailPage} from '../pages/billing/InvoiceDetailPage';
import {MerchantProfilePage} from '../pages/merchant/MerchantProfilePage';
import {BusinessPage} from '../pages/merchant/BusinessPage';
import {DocumentsPage} from '../pages/merchant/DocumentsPage';
import {KybPage} from '../pages/merchant/KybPage';
import {BankAccountsPage} from '../pages/merchant/BankAccountsPage';
import {TransactionsPage} from '../pages/TransactionsPage';
import {ProvidersPage} from '../pages/providers/ProvidersPage';
import {ProviderAccountsPage} from '../pages/providers/ProviderAccountsPage';
import {WebhooksPage} from '../pages/providers/WebhooksPage';
import {ApiKeysPage} from '../pages/developers/ApiKeysPage';
import {
  AppearancePage,
  AuditPage,
  ErrorsPage,
  OrganizationPage,
  RolesPage,
  SecurityEventsPage,
  UsersPage,
} from '../pages/security/SecurityPages';
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

function RequireAuth({children}: {children: React.ReactNode}) {
  const {token, loading} = useAuth();
  if (loading) return <LoadingState label="Restoring session…" />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RP({anyOf, children}: {anyOf: string[]; children: React.ReactNode}) {
  return <RequirePermission anyOf={anyOf}>{children}</RequirePermission>;
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
      <Route path="/checkout/:token" element={<CheckoutPage />} />
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
        <Route
          index
          element={
            <RP anyOf={['payments.read', 'org.read', 'billing.read', 'platform.admin', 'platform.support']}>
              <DashboardPage />
            </RP>
          }
        />
        <Route path="forbidden" element={<ForbiddenPage />} />
        <Route path="payment-config" element={<RP anyOf={['payment_config.read']}><PaymentConfigPage /></RP>} />
        <Route path="payment-links" element={<RP anyOf={['payment_links.read']}><PaymentLinksPage /></RP>} />
        <Route path="payment-links/:id" element={<RP anyOf={['payment_links.read']}><PaymentLinkDetailPage /></RP>} />
        <Route path="payments" element={<RP anyOf={['payments.read']}><PaymentsPage /></RP>} />
        <Route path="payments/:id" element={<RP anyOf={['payments.read']}><PaymentDetailPage /></RP>} />
        <Route path="transactions" element={<RP anyOf={['payments.read']}><TransactionsPage /></RP>} />
        <Route path="customers" element={<RP anyOf={['customers.read', 'billing.read', 'billing.manage']}><CustomersPage /></RP>} />
        <Route path="products" element={<RP anyOf={['products.read', 'plans.read', 'billing.manage']}><ProductsPage /></RP>} />
        <Route path="prices" element={<RP anyOf={['prices.read', 'plans.read', 'billing.manage']}><PricesPage /></RP>} />
        <Route path="subscriptions" element={<RP anyOf={['subscriptions.read', 'billing.read', 'billing.manage']}><SubscriptionsPage /></RP>} />
        <Route path="subscriptions/:id" element={<RP anyOf={['subscriptions.read', 'billing.read', 'billing.manage']}><SubscriptionDetailPage /></RP>} />
        <Route path="invoices" element={<RP anyOf={['invoices.read', 'billing.read', 'billing.manage']}><InvoicesPage /></RP>} />
        <Route path="invoices/:id" element={<RP anyOf={['invoices.read', 'billing.read', 'billing.manage']}><InvoiceDetailPage /></RP>} />
        <Route path="merchant/profile" element={<RP anyOf={['merchant.read']}><MerchantProfilePage /></RP>} />
        <Route path="merchant/business" element={<RP anyOf={['merchant.read']}><BusinessPage /></RP>} />
        <Route path="merchant/kyb" element={<RP anyOf={['kyb.read']}><KybPage /></RP>} />
        <Route path="merchant/documents" element={<RP anyOf={['documents.read']}><DocumentsPage /></RP>} />
        <Route path="merchant/bank-accounts" element={<RP anyOf={['bank.read']}><BankAccountsPage /></RP>} />
        <Route path="providers" element={<RP anyOf={['providers.read', 'developer.read']}><ProvidersPage /></RP>} />
        <Route path="providers/accounts" element={<RP anyOf={['providers.read']}><ProviderAccountsPage /></RP>} />
        <Route path="providers/webhooks" element={<RP anyOf={['webhooks.read', 'events.read']}><WebhooksPage /></RP>} />
        <Route path="developers/api-keys" element={<RP anyOf={['api_keys.read', 'developer.read']}><ApiKeysPage /></RP>} />
        <Route path="security/users" element={<RP anyOf={['users.read']}><UsersPage /></RP>} />
        <Route path="security/roles" element={<RP anyOf={['roles.read']}><RolesPage /></RP>} />
        <Route path="security/audit" element={<RP anyOf={['audit.read']}><AuditPage /></RP>} />
        <Route path="security/events" element={<RP anyOf={['security.read']}><SecurityEventsPage /></RP>} />
        <Route path="security/errors" element={<RP anyOf={['errors.read']}><ErrorsPage /></RP>} />
        <Route path="settings/organization" element={<RP anyOf={['org.read', 'settings.read']}><OrganizationPage /></RP>} />
        <Route path="settings/appearance" element={<RP anyOf={['settings.read', 'org.read']}><AppearancePage /></RP>} />
        <Route path="refunds" element={<RP anyOf={['payments.refund', 'payments.manage']}><RefundsPage /></RP>} />
        <Route path="balances" element={<RP anyOf={['balances.read']}><BalancesPage /></RP>} />
        <Route path="settlements" element={<RP anyOf={['settlements.read', 'settlements.manage']}><SettlementsPage /></RP>} />
        <Route path="payouts" element={<RP anyOf={['payouts.read', 'payouts.manage']}><PayoutsPage /></RP>} />
        <Route path="disputes" element={<RP anyOf={['disputes.read', 'disputes.manage']}><DisputesPage /></RP>} />
        <Route path="risk" element={<RP anyOf={['disputes.read', 'platform.risk.manage']}><RiskPage /></RP>} />
        <Route path="coming-soon/:feature" element={<ComingSoonPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
