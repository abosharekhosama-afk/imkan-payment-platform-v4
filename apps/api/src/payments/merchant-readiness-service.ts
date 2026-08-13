import {config} from '../config.js';
import {pgQuery} from '../infrastructure/db/postgres.js';
import {getOnboardingGateState} from '../security/onboarding-gate.js';

export type ReadinessItem = {
  id: string;
  status: 'complete' | 'pending' | 'optional' | 'blocked';
  detail?: string;
  href?: string;
};

export const merchantReadinessService = {
  async getPaymentsReadiness(organizationId: string, userId: string) {
    const [onboarding, routes, configRow, bank, user, paymentCount] = await Promise.all([
      getOnboardingGateState(organizationId),
      pgQuery(
        `SELECT pr.environment, p.code AS provider_code, pr.is_active
         FROM provider_routes pr
         JOIN provider_accounts pa ON pa.id = pr.provider_account_id
         JOIN providers p ON p.id = pa.provider_id
         WHERE pr.organization_id=$1 AND pr.is_active=TRUE
           AND pr.currency_code IS NULL AND pr.payment_method_type_code IS NULL
         ORDER BY pr.environment, pr.priority`,
        [organizationId],
      ),
      pgQuery(
        `SELECT company_display_name, default_success_url FROM merchant_payment_config WHERE organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('VERIFIED','ACTIVE'))::int AS verified
         FROM payout_accounts WHERE organization_id=$1`,
        [organizationId],
      ),
      pgQuery(`SELECT email_verified_at, mfa_enabled FROM users WHERE id=$1`, [userId]),
      pgQuery(`SELECT COUNT(*)::int AS c FROM payment_intents WHERE organization_id=$1`, [organizationId]),
    ]);

    const sandboxRoute = routes.rows.find((r) => r.environment === 'SANDBOX');
    const liveRoute = routes.rows.find((r) => r.environment === 'LIVE');
    const providerCode = sandboxRoute?.provider_code || null;
    const moneyProviders = new Set(['stripe', 'paytabs', 'bop']);
    const cfg = configRow.rows[0];
    const emailVerified = Boolean(user.rows[0]?.email_verified_at);

    const items: ReadinessItem[] = [
      {
        id: 'email_verified',
        status: emailVerified || !config.requireEmailVerification ? 'complete' : 'pending',
        detail: emailVerified ? undefined : 'Verify your email address',
        href: '/verify-email',
      },
      {
        id: 'kyb',
        status: onboarding.payments_allowed
          ? onboarding.kyb_status === 'APPROVED'
            ? 'complete'
            : 'pending'
          : 'blocked',
        detail: `KYB: ${onboarding.kyb_status}`,
        href: '/merchant/kyb',
      },
      {
        id: 'provider_route',
        status: moneyProviders.has(providerCode || '') ? 'complete' : providerCode === 'sandbox' ? 'pending' : 'blocked',
        detail: providerCode ? `SANDBOX → ${providerCode}` : 'No payment provider route',
        href: '/providers/accounts',
      },
      {
        id: 'payment_config',
        status: cfg?.company_display_name ? 'complete' : 'pending',
        detail: cfg?.company_display_name ? undefined : 'Set checkout branding',
        href: '/payment-config',
      },
      {
        id: 'bank_account',
        status: bank.rows[0]?.total > 0 ? (bank.rows[0]?.verified > 0 ? 'complete' : 'pending') : 'optional',
        detail:
          bank.rows[0]?.total > 0
            ? bank.rows[0]?.verified > 0
              ? 'Payout account verified'
              : 'Awaiting bank verification'
            : 'Optional for Stripe card collection — required for IMKAN payouts',
        href: '/merchant/bank-accounts',
      },
      {
        id: 'live_provider',
        status: moneyProviders.has(liveRoute?.provider_code || '') ? 'complete' : 'optional',
        detail: liveRoute?.provider_code ? `LIVE → ${liveRoute.provider_code}` : 'Configure when going live',
        href: '/providers/accounts',
      },
    ];

    const requiredIds = ['email_verified', 'kyb', 'provider_route', 'payment_config'];
    const requiredComplete = requiredIds.every((id) => {
      const item = items.find((i) => i.id === id);
      return item?.status === 'complete' || item?.status === 'pending';
    });
    const blocked = items.some((i) => requiredIds.includes(i.id) && i.status === 'blocked');
    const readyForSandbox =
      !blocked &&
      onboarding.payments_allowed &&
      moneyProviders.has(providerCode || '') &&
      Boolean(cfg?.company_display_name);
    const readyForLive = readyForSandbox && moneyProviders.has(liveRoute?.provider_code || '');

    return {
      items,
      summary: {
        ready_for_sandbox_checkout: readyForSandbox,
        ready_for_live_checkout: readyForLive,
        payments_allowed: onboarding.payments_allowed,
        provider_sandbox: providerCode,
        provider_live: liveRoute?.provider_code || null,
        payment_count: paymentCount.rows[0]?.c ?? 0,
        uses_stripe: providerCode === 'stripe' || liveRoute?.provider_code === 'stripe',
        uses_paytabs: providerCode === 'paytabs' || liveRoute?.provider_code === 'paytabs',
      },
      onboarding,
    };
  },
};
