import {resolveSecretRef} from '../../security/secrets/index.js';
import type {PayTabsCredentials} from './types.js';
import {assertPayTabsSandboxOnly, resolvePayTabsEnv} from './config.js';

const DEFAULT_SANDBOX_BASE = 'https://secure-egypt.paytabs.com';

export function resolvePayTabsMode(): 'simulate' | 'http' {
  assertPayTabsSandboxOnly('adapter mode');
  const explicit = (process.env.PAYTABS_ADAPTER_MODE || '').toLowerCase().trim();
  if (explicit === 'simulate' || explicit === 'http') return explicit;
  if ((process.env.PAYTABS_REAL_SANDBOX_CERT || '').toLowerCase() === 'true') return 'http';
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return 'simulate';
  return 'http';
}

export async function loadPayTabsSandboxCredentials(): Promise<PayTabsCredentials | null> {
  assertPayTabsSandboxOnly('load credentials');
  if (resolvePayTabsEnv() !== 'sandbox') return null;

  if (resolvePayTabsMode() === 'simulate') {
    return {
      baseUrl: DEFAULT_SANDBOX_BASE,
      profileId: 'SIM_PROFILE',
      serverKey: 'SIM_SERVER_KEY',
      callbackUrl: process.env.PAYTABS_SANDBOX_CALLBACK_URL || 'https://localhost/api/v1/webhooks/providers/paytabs',
      returnUrl: process.env.PAYTABS_SANDBOX_RETURN_URL || 'https://localhost/checkout/return',
      webhookSecret: 'SIM_SERVER_KEY',
    };
  }

  try {
    const [serverKey, profileId, baseUrl, callbackUrl, returnUrl] = await Promise.all([
      resolveSecretRef('PAYTABS_SANDBOX_SERVER_KEY', 'provider_api_key').catch(() => null),
      resolveSecretRef('PAYTABS_SANDBOX_PROFILE_ID', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_SANDBOX_BASE_URL', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_SANDBOX_CALLBACK_URL', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_SANDBOX_RETURN_URL', 'other').catch(() => null),
    ]);

    const key = serverKey?.value || process.env.PAYTABS_SANDBOX_SERVER_KEY || '';
    const profile = profileId?.value || process.env.PAYTABS_SANDBOX_PROFILE_ID || '';
    if (!key || !profile) return null;

    return {
      baseUrl: (baseUrl?.value || process.env.PAYTABS_SANDBOX_BASE_URL || DEFAULT_SANDBOX_BASE).replace(/\/$/, ''),
      profileId: profile,
      serverKey: key,
      callbackUrl:
        callbackUrl?.value ||
        process.env.PAYTABS_SANDBOX_CALLBACK_URL ||
        'https://localhost/api/v1/webhooks/providers/paytabs',
      returnUrl: returnUrl?.value || process.env.PAYTABS_SANDBOX_RETURN_URL || 'https://localhost/checkout/return',
      webhookSecret: key,
    };
  } catch {
    return null;
  }
}
