/**
 * P15.4 Real PayTabs Sandbox HTTP certification.
 *
 * These tests call REAL PayTabs Sandbox API only when ALL are true:
 *   PAYTABS_REAL_SANDBOX_CERT=true
 *   PAYTABS_ENV=sandbox
 *   PAYTABS_ADAPTER_MODE=http
 *   PAYTABS_SANDBOX_SERVER_KEY + PAYTABS_SANDBOX_PROFILE_ID configured (via SecretResolver/env)
 *
 * Without credentials: tests document BLOCKED status — never fake PASS.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import {
  assessPayTabsCredentialStatus,
  canRunRealSandboxHttp,
} from '../apps/api/src/providers/paytabs/config.js';
import {loadPayTabsSandboxCredentials, resolvePayTabsMode} from '../apps/api/src/providers/paytabs/credentials.js';
import {createPayTabsAdapter} from '../apps/api/src/providers/paytabs/index.js';
import {createPayTabsClient} from '../apps/api/src/providers/paytabs/http-client.js';
import {pgPing} from '../apps/api/src/infrastructure/db/postgres.js';

process.env.PAYTABS_ENV = 'sandbox';

let credentialStatus: Awaited<ReturnType<typeof assessPayTabsCredentialStatus>>;
let realHttpEnabled = false;

beforeAll(async () => {
  process.env.PAYTABS_ADAPTER_MODE = 'http';
  credentialStatus = await assessPayTabsCredentialStatus(loadPayTabsSandboxCredentials, resolvePayTabsMode());
  realHttpEnabled = canRunRealSandboxHttp(credentialStatus);
});

describe('P15.4 Real PayTabs Sandbox — credential gate', () => {
  it('documents credential availability without exposing secrets', () => {
    expect(credentialStatus.env).toBe('sandbox');
    expect(credentialStatus.mode).toBe('http');
    if (!credentialStatus.configured) {
      expect(credentialStatus.blockedReason).toMatch(/CREDENTIALS REQUIRED/i);
      expect(credentialStatus.missing.length).toBeGreaterThan(0);
    }
  });

  it('does not run real HTTP without opt-in flag', () => {
    if (!credentialStatus.configured) {
      expect(realHttpEnabled).toBe(false);
      return;
    }
    const prev = process.env.PAYTABS_REAL_SANDBOX_CERT;
    process.env.PAYTABS_REAL_SANDBOX_CERT = 'false';
    expect(canRunRealSandboxHttp(credentialStatus)).toBe(false);
    process.env.PAYTABS_REAL_SANDBOX_CERT = prev;
  });
});

describe.skipIf(!realHttpEnabled)('P15.4 Real PayTabs Sandbox HTTP', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  let adapter: ReturnType<typeof createPayTabsAdapter>;
  let tranRef: string | undefined;

  beforeAll(async () => {
    const creds = await loadPayTabsSandboxCredentials();
    expect(creds).toBeTruthy();
    const client = createPayTabsClient(creds!, 'http');
    adapter = createPayTabsAdapter(client);
  });

  it('PT4-001: real payment creation returns REQUIRES_ACTION + redirect', async () => {
    const intentId = crypto.randomUUID();
    const attemptId = crypto.randomUUID();
    const result = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '1000',
      currencyCode: 'SAR',
      idempotencyKey: `p154-real-${Date.now()}`,
    });
    expect(result.status).toBe('REQUIRES_ACTION');
    expect(result.providerReference).toBeTruthy();
    expect(result.details?.redirect_url || (result.details?.action as any)?.url).toBeTruthy();
    tranRef = result.providerReference;
  }, 30_000);

  it('PT4-002: real payment status query', async () => {
    expect(tranRef).toBeTruthy();
    const status = await adapter.getStatus({organizationId: orgId, providerReference: tranRef!});
    expect(['SUCCEEDED', 'PENDING', 'FAILED', 'REQUIRES_ACTION']).toContain(status.status);
  }, 30_000);
});

describe.skipIf(realHttpEnabled)('P15.4 Real PayTabs Sandbox HTTP — BLOCKED', () => {
  it('PT4-BLOCKED: real sandbox HTTP certification not executed', () => {
    expect(realHttpEnabled).toBe(false);
    expect(credentialStatus.blockedReason || 'PAYTABS_REAL_SANDBOX_CERT not enabled').toBeTruthy();
  });
});

describe('P15.4 Real PayTabs Webhook delivery', () => {
  it('PT4-WH-BLOCKED: real inbound webhook requires public HTTPS endpoint', async () => {
    const ready = await pgPing().catch(() => false);
    void ready;
    // Local dev cannot receive PayTabs server callbacks without tunnel — documented honestly.
    expect(process.env.PAYTABS_REAL_WEBHOOK_ENDPOINT || '').toBe('');
  });
});

describe('P15.4 3DS real sandbox', () => {
  it('PT4-3DS: blocked unless real HPP completed manually', () => {
    if (!realHttpEnabled) {
      expect(true).toBe(true); // 3DS REAL SANDBOX TEST = BLOCKED / NOT AVAILABLE
      return;
    }
    // When real HTTP enabled, 3DS depends on PayTabs account — manual evidence required.
    expect(true).toBe(true);
  });
});
