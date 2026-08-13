/**
 * PayTabs environment and credential validation (P15.4).
 * SANDBOX ONLY — LIVE is blocked in this phase.
 */
import type {PayTabsCredentials} from './types.js';

export type PayTabsEnv = 'sandbox' | 'live';

const SIMULATE_PLACEHOLDERS = new Set(['SIM_PROFILE', 'SIM_SERVER_KEY', 'SIMULATE', 'test', 'fake', 'placeholder']);

export function resolvePayTabsEnv(): PayTabsEnv {
  const raw = (process.env.PAYTABS_ENV || 'sandbox').toLowerCase().trim();
  if (raw === 'live' || raw === 'production' || raw === 'prod') return 'live';
  return 'sandbox';
}

/** Throws if LIVE without PAYTABS_ALLOW_LIVE=true. */
export function assertPayTabsSandboxOnly(context?: string): void {
  const env = resolvePayTabsEnv();
  if (env === 'live' && process.env.PAYTABS_ALLOW_LIVE !== 'true') {
    throw new Error(
      `PayTabs LIVE is blocked until PAYTABS_ALLOW_LIVE=true${context ? ` (${context})` : ''}.`,
    );
  }
}

export function payTabsLiveEnabled(): boolean {
  return resolvePayTabsEnv() === 'live' && process.env.PAYTABS_ALLOW_LIVE === 'true';
}

export type PayTabsCredentialStatus = {
  configured: boolean;
  mode: 'simulate' | 'http';
  env: PayTabsEnv;
  missing: string[];
  blockedReason?: string;
};

export function credentialFieldMissing(value: string | undefined | null): boolean {
  const v = String(value || '').trim();
  if (!v) return true;
  if (SIMULATE_PLACEHOLDERS.has(v)) return true;
  return false;
}

/** True when real HTTP sandbox credentials are present (not simulate placeholders). */
export function isRealSandboxCredentialSet(creds: PayTabsCredentials | null): boolean {
  if (!creds) return false;
  if (credentialFieldMissing(creds.serverKey) || credentialFieldMissing(creds.profileId)) return false;
  if (SIMULATE_PLACEHOLDERS.has(creds.serverKey) || SIMULATE_PLACEHOLDERS.has(creds.profileId)) return false;
  return true;
}

export async function assessPayTabsCredentialStatus(
  loadCreds: () => Promise<PayTabsCredentials | null>,
  mode: 'simulate' | 'http',
): Promise<PayTabsCredentialStatus> {
  assertPayTabsSandboxOnly('credential assessment');
  const env = resolvePayTabsEnv();
  const missing: string[] = [];

  if (mode === 'simulate') {
    return {configured: true, mode, env, missing: []};
  }

  const creds = await loadCreds();
  if (!creds) {
    missing.push('PAYTABS_SANDBOX_SERVER_KEY', 'PAYTABS_SANDBOX_PROFILE_ID');
    return {
      configured: false,
      mode,
      env,
      missing,
      blockedReason: 'REAL SANDBOX CERTIFICATION BLOCKED — MERCHANT SANDBOX CREDENTIALS REQUIRED',
    };
  }

  if (credentialFieldMissing(creds.serverKey)) missing.push('PAYTABS_SANDBOX_SERVER_KEY');
  if (credentialFieldMissing(creds.profileId)) missing.push('PAYTABS_SANDBOX_PROFILE_ID');
  if (credentialFieldMissing(creds.callbackUrl)) missing.push('PAYTABS_SANDBOX_CALLBACK_URL');
  if (credentialFieldMissing(creds.returnUrl)) missing.push('PAYTABS_SANDBOX_RETURN_URL');

  const configured = missing.length === 0 && isRealSandboxCredentialSet(creds);
  return {
    configured,
    mode,
    env,
    missing,
    blockedReason: configured
      ? undefined
      : 'REAL SANDBOX CERTIFICATION BLOCKED — MERCHANT SANDBOX CREDENTIALS REQUIRED',
  };
}

/** Gate for opt-in real sandbox certification runs. */
export function isRealSandboxCertRequested(): boolean {
  return (process.env.PAYTABS_REAL_SANDBOX_CERT || '').toLowerCase() === 'true';
}

export function canRunRealSandboxHttp(loadResult: PayTabsCredentialStatus): boolean {
  return (
    isRealSandboxCertRequested() &&
    loadResult.mode === 'http' &&
    loadResult.env === 'sandbox' &&
    loadResult.configured
  );
}
