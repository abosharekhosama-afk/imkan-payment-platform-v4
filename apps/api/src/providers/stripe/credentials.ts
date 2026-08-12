import {resolveSecretRef} from '../../security/secrets/index.js';
import type {StripeCredentials} from './types.js';
import {
  assertStripePlaneAllowed,
  classifyStripeSecretKey,
  isPlaceholder,
  resolveStripeRequestedPlane,
  type StripeKeyPlane,
} from './config.js';

export function resolveStripeMode(): 'simulate' | 'http' {
  const explicit = (process.env.STRIPE_ADAPTER_MODE || '').toLowerCase().trim();
  if (explicit === 'simulate' || explicit === 'http') return explicit;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return 'simulate';
  // Prefer http when real keys present
  if (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY) return 'http';
  return 'simulate';
}

function defaultSuccessUrl(): string {
  const publicUrl = (process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  return (
    process.env.STRIPE_SUCCESS_URL ||
    process.env.PAYTABS_SANDBOX_RETURN_URL ||
    (publicUrl ? `${publicUrl}/checkout/return` : 'http://localhost:5173/checkout/return')
  );
}

function defaultCancelUrl(): string {
  const publicUrl = (process.env.APP_PUBLIC_URL || '').replace(/\/$/, '');
  return (
    process.env.STRIPE_CANCEL_URL ||
    (publicUrl ? `${publicUrl}/checkout/return?status=cancelled` : 'http://localhost:5173/checkout/return?status=cancelled')
  );
}

/**
 * Load credentials for the requested plane (test vs live).
 * Test keys: STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY (sk_test_)
 * Live keys: STRIPE_LIVE_SECRET_KEY (preferred) or STRIPE_SECRET_KEY (sk_live_) when STRIPE_ALLOW_LIVE=true
 */
export async function loadStripeCredentials(
  plane: StripeKeyPlane = resolveStripeRequestedPlane(),
): Promise<StripeCredentials | null> {
  if (resolveStripeMode() === 'simulate') {
    return {
      secretKey: 'SIM_STRIPE_SECRET',
      webhookSecret: 'SIM_WEBHOOK',
      publishableKey: 'pk_test_SIM',
      successUrl: defaultSuccessUrl(),
      cancelUrl: defaultCancelUrl(),
      isLiveKey: false,
    };
  }

  const secretEnv =
    plane === 'live'
      ? ['STRIPE_LIVE_SECRET_KEY', 'STRIPE_SECRET_KEY']
      : ['STRIPE_TEST_SECRET_KEY', 'STRIPE_SECRET_KEY'];
  const webhookEnv =
    plane === 'live'
      ? ['STRIPE_LIVE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET']
      : ['STRIPE_TEST_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET'];

  let secretKey = '';
  for (const name of secretEnv) {
    const fromResolver = await resolveSecretRef(name, 'provider_api_key').catch(() => null);
    secretKey = fromResolver?.value || process.env[name] || '';
    if (secretKey && !isPlaceholder(secretKey)) break;
  }

  let webhookSecret = '';
  for (const name of webhookEnv) {
    const fromResolver = await resolveSecretRef(name, 'other').catch(() => null);
    webhookSecret = fromResolver?.value || process.env[name] || '';
    if (webhookSecret && !isPlaceholder(webhookSecret)) break;
  }

  if (!secretKey || !webhookSecret) return null;

  try {
    assertStripePlaneAllowed(secretKey, plane);
  } catch {
    return null;
  }

  const pub =
    plane === 'live'
      ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY
      : process.env.STRIPE_TEST_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY;

  return {
    secretKey,
    webhookSecret,
    publishableKey: pub || undefined,
    successUrl: defaultSuccessUrl(),
    cancelUrl: defaultCancelUrl(),
    isLiveKey: classifyStripeSecretKey(secretKey) === 'live',
  };
}
