/**
 * Provider capability profiles.
 * Live provider activation: BLOCKED BY DEC-009.
 */

export type ProviderCapabilityFlags = {
  payment: boolean;
  authorization: boolean;
  capture: boolean;
  cancel: boolean;
  refund: boolean;
  partial_refund: boolean;
  tokenization: boolean;
  recurring: boolean;
  three_ds: boolean;
  webhooks: boolean;
  disputes: boolean;
  settlement: boolean;
  payout: boolean;
  idempotency: boolean;
};

export const SANDBOX_CAPABILITIES: ProviderCapabilityFlags = {
  payment: true,
  authorization: true,
  capture: true,
  cancel: true,
  refund: true,
  partial_refund: true,
  tokenization: true,
  recurring: true,
  three_ds: false,
  webhooks: true,
  disputes: false,
  settlement: false,
  payout: false,
  idempotency: true,
};

/** Documented only — not registered as a live adapter until DEC-009. */
export const PAYTABS_CAPABILITIES: ProviderCapabilityFlags = {
  payment: true,
  authorization: true,
  capture: true,
  cancel: true,
  refund: true,
  partial_refund: true,
  tokenization: true,
  recurring: false,
  three_ds: true,
  webhooks: true,
  disputes: true,
  settlement: true,
  payout: false,
  idempotency: true,
};

const MATRIX: Record<string, {environment: string; live_blocked_by?: string; capabilities: ProviderCapabilityFlags}> =
  {
    SANDBOX: {environment: 'SANDBOX', capabilities: SANDBOX_CAPABILITIES},
    PAYTABS: {
      environment: 'SANDBOX',
      live_blocked_by: 'DEC-009',
      capabilities: PAYTABS_CAPABILITIES,
    },
  };

export function getCapabilityProfile(code: string) {
  const key = code.toUpperCase();
  const profile = MATRIX[key];
  if (!profile) {
    return {
      code: key,
      found: false,
      live_blocked_by: 'DEC-009',
      capabilities: null as ProviderCapabilityFlags | null,
      note: 'Unknown provider — do not invent capabilities',
    };
  }
  return {
    code: key,
    found: true,
    ...profile,
      note:
      key === 'SANDBOX'
        ? 'Sandbox adapter is active'
        : key === 'PAYTABS'
          ? 'PayTabs V4 adapter registered — SANDBOX only in P15.3; LIVE blocked by DEC-009'
          : 'Live adapter registration BLOCKED BY: DEC-009',
  };
}

export function refuseLiveProviderActivation(code: string): never {
  const err = new Error(`Live provider '${code}' activation BLOCKED BY: DEC-009`);
  (err as any).code = 'LIVE_PROVIDER_BLOCKED';
  (err as any).statusCode = 423;
  throw err;
}
