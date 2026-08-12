/**
 * Stripe environment plane: test (sandbox) vs live.
 * LIVE money requires STRIPE_ALLOW_LIVE=true + sk_live_ key.
 */
export type StripeKeyPlane = 'test' | 'live';

export function resolveStripeRequestedPlane(): StripeKeyPlane {
  const env = (process.env.STRIPE_ENV || process.env.APP_ENV || 'sandbox').toLowerCase().trim();
  if (env === 'live' || env === 'production' || env === 'prod') return 'live';
  return 'test';
}

export function isStripeLiveAllowed(): boolean {
  return (process.env.STRIPE_ALLOW_LIVE || '').toLowerCase() === 'true';
}

export function classifyStripeSecretKey(secretKey: string): StripeKeyPlane | 'invalid' {
  const k = String(secretKey || '').trim();
  if (k.startsWith('sk_live_')) return 'live';
  if (k.startsWith('sk_test_') || k === 'SIM_STRIPE_SECRET') return 'test';
  return 'invalid';
}

export function assertStripePlaneAllowed(secretKey: string, requested: StripeKeyPlane): void {
  const plane = classifyStripeSecretKey(secretKey);
  if (plane === 'invalid') {
    throw new Error('Invalid Stripe secret key — expected sk_test_… or sk_live_…');
  }
  if (requested === 'test' && plane === 'live') {
    throw new Error('Stripe LIVE key refused on test/sandbox plane — use sk_test_…');
  }
  if (requested === 'live') {
    if (!isStripeLiveAllowed()) {
      throw new Error('Stripe LIVE blocked — set STRIPE_ALLOW_LIVE=true after DEC-009 / ops review');
    }
    if (plane !== 'live') {
      throw new Error('Stripe LIVE plane requires sk_live_… secret key');
    }
  }
}

export type StripeCredentialStatus = {
  configured: boolean;
  plane: StripeKeyPlane;
  mode: 'simulate' | 'http';
  missing: string[];
  blockedReason?: string;
};

const PLACEHOLDERS = new Set(['SIM_STRIPE_SECRET', 'SIM_WEBHOOK', 'placeholder', 'test', 'fake']);

export function isPlaceholder(value: string | undefined | null): boolean {
  const v = String(value || '').trim();
  return !v || PLACEHOLDERS.has(v);
}

export function isRealStripeCredentialSet(secretKey: string, webhookSecret: string): boolean {
  if (isPlaceholder(secretKey) || isPlaceholder(webhookSecret)) return false;
  const plane = classifyStripeSecretKey(secretKey);
  return plane === 'test' || plane === 'live';
}

/** hosted = redirect to checkout.stripe.com; elements = Payment Element on IMKAN checkout page */
export function resolveStripeCheckoutUi(): 'hosted' | 'elements' {
  const ui = (process.env.STRIPE_CHECKOUT_UI || 'elements').toLowerCase().trim();
  return ui === 'hosted' ? 'hosted' : 'elements';
}
