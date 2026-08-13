import {resolveSecretRef} from '../../security/secrets/index.js';
import type {PayTabsCredentials} from './types.js';
import {assertPayTabsSandboxOnly, payTabsLiveEnabled, resolvePayTabsEnv} from './config.js';

/** Regional PayTabs hosts for GCC / Arab markets. */
export const PAYTABS_REGIONAL_BASE: Record<string, string> = {
  SA: 'https://secure.paytabs.sa',
  AE: 'https://secure.paytabs.com',
  EG: 'https://secure-egypt.paytabs.com',
  JO: 'https://secure-jordan.paytabs.com',
  OM: 'https://secure-oman.paytabs.com',
  KW: 'https://secure.paytabs.com.kw',
  BH: 'https://secure.paytabs.com',
  QA: 'https://secure.paytabs.com',
  PS: 'https://secure-jordan.paytabs.com',
};

const DEFAULT_SANDBOX_BASE = PAYTABS_REGIONAL_BASE.EG;

export function payTabsBaseUrlForRegion(region = process.env.PAYTABS_REGION || 'EG'): string {
  return PAYTABS_REGIONAL_BASE[region.toUpperCase()] || DEFAULT_SANDBOX_BASE;
}

export function resolvePayTabsMode(): 'simulate' | 'http' {
  if (payTabsLiveEnabled()) return 'http';
  assertPayTabsSandboxOnly('adapter mode');
  const explicit = (process.env.PAYTABS_ADAPTER_MODE || '').toLowerCase().trim();
  if (explicit === 'simulate' || explicit === 'http') return explicit;
  if ((process.env.PAYTABS_REAL_SANDBOX_CERT || '').toLowerCase() === 'true') return 'http';
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') return 'simulate';
  return 'http';
}

export async function loadPayTabsSandboxCredentials(): Promise<PayTabsCredentials | null> {
  assertPayTabsSandboxOnly('load credentials');

  if (payTabsLiveEnabled()) {
    const [serverKey, profileId, baseUrl, callbackUrl, returnUrl] = await Promise.all([
      resolveSecretRef('PAYTABS_LIVE_SERVER_KEY', 'provider_api_key').catch(() => null),
      resolveSecretRef('PAYTABS_LIVE_PROFILE_ID', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_LIVE_BASE_URL', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_LIVE_CALLBACK_URL', 'other').catch(() => null),
      resolveSecretRef('PAYTABS_LIVE_RETURN_URL', 'other').catch(() => null),
    ]);
    const key = serverKey?.value || process.env.PAYTABS_LIVE_SERVER_KEY || '';
    const profile = profileId?.value || process.env.PAYTABS_LIVE_PROFILE_ID || '';
    if (!key || !profile) return null;
    return {
      baseUrl: (baseUrl?.value || process.env.PAYTABS_LIVE_BASE_URL || payTabsBaseUrlForRegion()).replace(/\/$/, ''),
      profileId: profile,
      serverKey: key,
      callbackUrl: callbackUrl?.value || process.env.PAYTABS_LIVE_CALLBACK_URL || '',
      returnUrl: returnUrl?.value || process.env.PAYTABS_LIVE_RETURN_URL || '',
      webhookSecret: key,
    };
  }

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
      baseUrl: (baseUrl?.value || process.env.PAYTABS_SANDBOX_BASE_URL || payTabsBaseUrlForRegion()).replace(
        /\/$/,
        '',
      ),
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
