/**
 * Sensitive operations registry for Phase 6.6.
 * Step-up / MFA binding uses requireStepUp() today; this catalog documents
 * which operations must require step-up (or are candidates for future MFA policy).
 */

import {PERMISSIONS} from './permissions-catalog.js';

export type SensitiveOp = {
  code: string;
  description: string;
  /** Permission(s) typically required (documentation / future policy engine) */
  permissions: string[];
  /** If true, route must use requireStepUp() now */
  stepUpRequired: boolean;
  /** Planned: re-auth / MFA challenge beyond step-up */
  futureMfaPolicy: 'step_up' | 'reauth' | 'mfa_challenge';
};

export const SENSITIVE_OPERATIONS: SensitiveOp[] = [
  {
    code: 'auth.password.change',
    description: 'Change password',
    permissions: [],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'users.invite',
    description: 'Create organization invitation',
    permissions: [PERMISSIONS.INVITES_MANAGE, PERMISSIONS.USERS_INVITE],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'users.deactivate',
    description: 'Deactivate organization user',
    permissions: [PERMISSIONS.USERS_DEACTIVATE, PERMISSIONS.USERS_REMOVE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'roles.assign',
    description: 'Assign or change user role',
    permissions: [PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USERS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'roles.custom.manage',
    description: 'Create/update/delete custom roles',
    permissions: [PERMISSIONS.ROLES_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'bank.account.create',
    description: 'Add payout bank account',
    permissions: [PERMISSIONS.BANK_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'bank.account.set_default',
    description: 'Change default payout account',
    permissions: [PERMISSIONS.BANK_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'bank.account.activate',
    description: 'Activate/deactivate bank account',
    permissions: [PERMISSIONS.BANK_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'api_keys.create',
    description: 'Create API key',
    permissions: [PERMISSIONS.API_KEYS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'api_keys.revoke',
    description: 'Revoke API key',
    permissions: [PERMISSIONS.API_KEYS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'providers.credentials',
    description: 'Manage live provider credentials',
    permissions: [PERMISSIONS.PROVIDERS_MANAGE, PERMISSIONS.PLATFORM_PROVIDERS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'org.ownership',
    description: 'Organization ownership changes',
    permissions: [PERMISSIONS.ORG_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'payments.refund',
    description: 'Refund payment (Phase 7+)',
    permissions: [PERMISSIONS.PAYMENTS_REFUND],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.execute',
    description: 'Execute payout (Phase 7+)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.manage',
    description: 'Create/manage payouts (Phase 7+ API)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.submit',
    description: 'Submit payout to sandbox runner (P15.1-E)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.mark_paid',
    description: 'Mark sandbox payout as PAID + ledger (P15.1-E)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.fail',
    description: 'Mark payout as FAILED (P15.1-E)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'payouts.cancel',
    description: 'Cancel PENDING payout (P15.1-E)',
    permissions: [PERMISSIONS.PAYOUTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
  {
    code: 'settlements.manage',
    description: 'Settlement operations (Phase 7+)',
    permissions: [PERMISSIONS.SETTLEMENTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'settlements.finalize',
    description: 'Finalize a settlement batch (P15.1-D)',
    permissions: [PERMISSIONS.SETTLEMENTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'settlements.cancel',
    description: 'Cancel a draft settlement (P15.1-D)',
    permissions: [PERMISSIONS.SETTLEMENTS_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'security.settings',
    description: 'Security settings / MFA admin',
    permissions: [PERMISSIONS.SECURITY_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'invoices.collect',
    description: 'Collect / charge an open invoice now',
    permissions: [PERMISSIONS.INVOICES_PAY, PERMISSIONS.INVOICES_MANAGE, PERMISSIONS.BILLING_MANAGE],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'billing.renewals.run',
    description: 'Run subscription renewal billing cycle',
    permissions: [PERMISSIONS.BILLING_MANAGE, PERMISSIONS.PLATFORM_ADMIN],
    stepUpRequired: true,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'subscriptions.pause',
    description: 'Pause an active subscription',
    permissions: [PERMISSIONS.SUBSCRIPTIONS_PAUSE, PERMISSIONS.SUBSCRIPTIONS_MANAGE],
    stepUpRequired: false,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'subscriptions.resume',
    description: 'Resume a paused subscription',
    permissions: [PERMISSIONS.SUBSCRIPTIONS_RESUME, PERMISSIONS.SUBSCRIPTIONS_MANAGE],
    stepUpRequired: false,
    futureMfaPolicy: 'step_up',
  },
  {
    code: 'subscriptions.cancel',
    description: 'Cancel a subscription',
    permissions: [PERMISSIONS.SUBSCRIPTIONS_CANCEL, PERMISSIONS.SUBSCRIPTIONS_MANAGE],
    stepUpRequired: false,
    futureMfaPolicy: 'reauth',
  },
  {
    code: 'payments.partial_refund',
    description: 'Partial refund (Phase 7+)',
    permissions: [PERMISSIONS.PAYMENTS_PARTIAL_REFUND],
    stepUpRequired: true,
    futureMfaPolicy: 'mfa_challenge',
  },
];

export function getSensitiveOp(code: string): SensitiveOp | undefined {
  return SENSITIVE_OPERATIONS.find((o) => o.code === code);
}

export function sensitiveOpRequiresStepUp(code: string): boolean {
  const op = getSensitiveOp(code);
  return op?.stepUpRequired === true;
}
