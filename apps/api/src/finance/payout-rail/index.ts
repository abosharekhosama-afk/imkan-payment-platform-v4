/**
 * Payout rail adapters — money movement out of IMKAN to merchant IBAN.
 * AuditedManualRail is the transitional rail: submit is recorded, mark-paid
 * requires platform approval + external evidence (not a silent bank transfer).
 */
import {AppError} from '../../foundation/errors.js';

export type PayoutRailSubmitInput = {
  organizationId: string;
  payoutId: string;
  amountMinor: string;
  currencyCode: string;
  payoutAccountId: string | null;
  actorUserId?: string | null;
};

export type PayoutRailResult = {
  railCode: string;
  status: 'SUBMITTED' | 'PAID' | 'FAILED';
  railReference?: string | null;
  message?: string;
};

export interface PayoutRailAdapter {
  readonly code: string;
  submit(input: PayoutRailSubmitInput): Promise<PayoutRailResult>;
}

export class AuditedManualRail implements PayoutRailAdapter {
  readonly code = 'audited_manual';

  async submit(input: PayoutRailSubmitInput): Promise<PayoutRailResult> {
    if (!input.payoutAccountId) {
      throw new AppError('PAYOUT_ACCOUNT_REQUIRED', 'A verified payout account is required', 422);
    }
    return {
      railCode: this.code,
      status: 'SUBMITTED',
      railReference: `manual:${input.payoutId}`,
      message: 'Queued for dual-control platform approval and bank evidence before mark-paid',
    };
  }
}

export class ProviderSettlementRail implements PayoutRailAdapter {
  readonly code = 'provider_settlement';

  async submit(input: PayoutRailSubmitInput): Promise<PayoutRailResult> {
    return {
      railCode: this.code,
      status: 'SUBMITTED',
      railReference: `provider:${input.payoutId}`,
      message: 'Awaiting provider settlement file / webhook confirmation',
    };
  }
}

export function resolvePayoutRail(): PayoutRailAdapter {
  const code = (process.env.PAYOUT_RAIL || 'audited_manual').toLowerCase();
  if (code === 'provider_settlement') return new ProviderSettlementRail();
  return new AuditedManualRail();
}

export function payoutMarkPaidAllowed(payout: {
  platform_approved_at?: string | null;
  external_evidence_ref?: string | null;
}): boolean {
  if (payout.platform_approved_at && payout.external_evidence_ref) return true;
  if (process.env.PAYOUT_ALLOW_BREAK_GLASS === 'true' && process.env.NODE_ENV !== 'production') return true;
  return false;
}
