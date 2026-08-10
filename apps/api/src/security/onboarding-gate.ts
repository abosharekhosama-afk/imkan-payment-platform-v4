/**
 * Merchant onboarding / KYB gate for money-moving APIs.
 * Frontend skip flags are NEVER trusted — this is the security boundary.
 * Source of truth: verification_cases (case_type=KYB), not a frontend flag.
 */
import {pgQuery} from '../infrastructure/db/postgres.js';
import {AppError} from '../foundation/errors.js';
import {config} from '../config.js';

/** DB statuses that unlock payment link create / checkout collect when requireKybForPayments. */
const MONEY_READY_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW', 'APPROVED']);

/** Test-only override — never set from request handlers. */
let requireKybOverride: boolean | null = null;

export function setRequireKybForPaymentsOverride(value: boolean | null) {
  requireKybOverride = value;
}

function kybRequired(): boolean {
  return requireKybOverride ?? config.requireKybForPayments;
}

export async function assertMerchantPaymentsAllowed(organizationId: string): Promise<void> {
  if (!kybRequired()) return;

  const r = await pgQuery<{status: string}>(
    `SELECT status FROM verification_cases
     WHERE organization_id=$1 AND case_type='KYB'
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId],
  );
  const status = r.rows[0]?.status || 'DRAFT';
  if (MONEY_READY_STATUSES.has(status)) return;

  throw new AppError(
    'ONBOARDING_INCOMPLETE',
    'Complete merchant KYB onboarding before creating or collecting payments',
    403,
    {kyb_status: status, require_kyb_for_payments: true},
  );
}

/** Read-only onboarding snapshot for UI (never a skip token). */
export async function getOnboardingGateState(organizationId: string) {
  const r = await pgQuery<{status: string}>(
    `SELECT status FROM verification_cases
     WHERE organization_id=$1 AND case_type='KYB'
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId],
  );
  const status = r.rows[0]?.status || 'DRAFT';
  const paymentsAllowed = !kybRequired() || MONEY_READY_STATUSES.has(status);
  return {
    kyb_status: status,
    payments_allowed: paymentsAllowed,
    require_kyb_for_payments: kybRequired(),
    force_onboarding_ui: status === 'DRAFT' || status === 'NEEDS_INFORMATION' || status === 'REJECTED',
  };
}
