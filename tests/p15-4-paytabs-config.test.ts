import {beforeEach, describe, expect, it} from 'vitest';
import {
  assertPayTabsSandboxOnly,
  assessPayTabsCredentialStatus,
  canRunRealSandboxHttp,
  credentialFieldMissing,
  isRealSandboxCredentialSet,
  resolvePayTabsEnv,
} from '../apps/api/src/providers/paytabs/config.js';
import type {PayTabsCredentials} from '../apps/api/src/providers/paytabs/types.js';

describe('P15.4 PayTabs sandbox config', () => {
  beforeEach(() => {
    delete process.env.PAYTABS_ENV;
    delete process.env.PAYTABS_REAL_SANDBOX_CERT;
  });

  it('defaults PAYTABS_ENV to sandbox', () => {
    expect(resolvePayTabsEnv()).toBe('sandbox');
  });

  it('blocks PAYTABS_ENV=live', () => {
    process.env.PAYTABS_ENV = 'live';
    expect(() => assertPayTabsSandboxOnly()).toThrow(/LIVE is blocked/i);
  });

  it('detects missing credentials', async () => {
    const status = await assessPayTabsCredentialStatus(async () => null, 'http');
    expect(status.configured).toBe(false);
    expect(status.blockedReason).toMatch(/CREDENTIALS REQUIRED/i);
  });

  it('rejects simulate placeholder credentials for real sandbox', () => {
    const creds: PayTabsCredentials = {
      baseUrl: 'https://secure-egypt.paytabs.com',
      profileId: 'SIM_PROFILE',
      serverKey: 'SIM_SERVER_KEY',
      callbackUrl: 'https://example.test/cb',
      returnUrl: 'https://example.test/return',
      webhookSecret: 'SIM_SERVER_KEY',
    };
    expect(isRealSandboxCredentialSet(creds)).toBe(false);
    expect(credentialFieldMissing('SIM_SERVER_KEY')).toBe(true);
  });

  it('accepts real-looking credentials shape', () => {
    const creds: PayTabsCredentials = {
      baseUrl: 'https://secure-egypt.paytabs.com',
      profileId: '123456',
      serverKey: 'SKJNTST-REAL-KEY-EXAMPLE',
      callbackUrl: 'https://api.example.test/webhooks/paytabs',
      returnUrl: 'https://checkout.example.test/return',
      webhookSecret: 'SKJNTST-REAL-KEY-EXAMPLE',
    };
    expect(isRealSandboxCredentialSet(creds)).toBe(true);
  });

  it('canRunRealSandboxHttp requires opt-in flag and configured creds', async () => {
    const creds: PayTabsCredentials = {
      baseUrl: 'https://secure-egypt.paytabs.com',
      profileId: '123456',
      serverKey: 'SKJNTST-REAL-KEY-EXAMPLE',
      callbackUrl: 'https://api.example.test/cb',
      returnUrl: 'https://checkout.example.test/return',
      webhookSecret: 'SKJNTST-REAL-KEY-EXAMPLE',
    };
    const status = await assessPayTabsCredentialStatus(async () => creds, 'http');
    expect(status.configured).toBe(true);
    expect(canRunRealSandboxHttp(status)).toBe(false);
    process.env.PAYTABS_REAL_SANDBOX_CERT = 'true';
    expect(canRunRealSandboxHttp(status)).toBe(true);
  });
});
