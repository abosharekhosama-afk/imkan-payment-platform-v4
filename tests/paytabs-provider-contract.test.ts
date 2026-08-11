import {beforeAll, describe, expect, it} from 'vitest';
import {createPayTabsAdapter, signPayTabsCallback} from '../apps/api/src/providers/paytabs/index.js';
import {createPayTabsSimulateClient} from '../apps/api/src/providers/paytabs/http-client.js';
import {loadPayTabsSandboxCredentials} from '../apps/api/src/providers/paytabs/credentials.js';
import {ProviderError, shouldQueryBeforeRetry} from '../apps/api/src/providers/errors.js';
import {verifyPayTabsCallbackSignature} from '../apps/api/src/providers/paytabs/webhook.js';

describe('PayTabs provider contract (P15.3 — simulate)', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000010';
  const attemptId = '00000000-0000-4000-8000-000000000020';
  let adapter: ReturnType<typeof createPayTabsAdapter>;

  beforeAll(async () => {
    process.env.PAYTABS_ADAPTER_MODE = 'simulate';
    const creds = await loadPayTabsSandboxCredentials();
    adapter = createPayTabsAdapter(createPayTabsSimulateClient(creds!));
  });

  it('authorize returns REQUIRES_ACTION with redirect URL (HPP / 3DS)', async () => {
    const result = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '2500',
      currencyCode: 'SAR',
      idempotencyKey: `auth:${attemptId}`,
    });
    expect(result.status).toBe('REQUIRES_ACTION');
    expect(result.providerCode).toBe('paytabs');
    expect(result.providerReference).toMatch(/^TST/);
    expect(result.details?.redirect_url).toMatch(/sandbox\.paytabs\.test/);
    expect((result.details?.action as any)?.type).toBe('3DS');
  });

  it('getStatus maps simulate authorized transaction', async () => {
    const auth = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '1000',
      currencyCode: 'SAR',
    });
    const status = await adapter.getStatus({
      organizationId: orgId,
      providerReference: auth.providerReference!,
    });
    expect(['SUCCEEDED', 'PENDING']).toContain(status.status);
  });

  it('refund succeeds against simulate store', async () => {
    const auth = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '5000',
      currencyCode: 'SAR',
    });
    const refund = await adapter.refund({
      organizationId: orgId,
      paymentTransactionId: auth.providerReference!,
      amountMinor: '1000',
      currencyCode: 'SAR',
      idempotencyKey: 'rf-test-1',
    });
    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.providerReference).toMatch(/^TST_RF_/);
  });

  it('partial refund amount accepted by simulate client', async () => {
    const auth = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '10000',
      currencyCode: 'SAR',
    });
    const partial = await adapter.refund({
      organizationId: orgId,
      paymentTransactionId: auth.providerReference!,
      amountMinor: '2500',
      currencyCode: 'SAR',
      idempotencyKey: 'rf-partial-1',
    });
    expect(partial.status).toBe('SUCCEEDED');
  });

  it('webhook signature verification accepts signed callback', async () => {
    const payload = signPayTabsCallback(
      {
        tran_ref: 'TST2016700000692',
        cart_id: 'cart_test_1',
        response_status: 'A',
        cart_amount: '25.00',
        cart_currency: 'SAR',
      },
      'SIM_SERVER_KEY',
    );
    expect(verifyPayTabsCallbackSignature(payload as any, 'SIM_SERVER_KEY')).toBe(true);
    const rawBody = JSON.stringify(payload);
    const verified = await adapter.verifyWebhook({
      headers: {'content-type': 'application/json'},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.event.eventType).toBe('paytabs.payment.succeeded');
      expect(verified.event.providerReference).toBe('TST2016700000692');
    }
  });

  it('invalid webhook signature rejected', async () => {
    const rawBody = JSON.stringify({
      tran_ref: 'TST_BAD',
      cart_id: 'c1',
      response_status: 'A',
      signature: 'deadbeef',
    });
    const verified = await adapter.verifyWebhook({
      headers: {},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(verified.valid).toBe(false);
  });

  it('LIVE webhooks rejected in P15.3', async () => {
    const verified = await adapter.verifyWebhook({headers: {}, rawBody: '{}', environment: 'LIVE'});
    expect(verified.valid).toBe(false);
    if (!verified.valid) expect(verified.error).toMatch(/SANDBOX-only/i);
  });

  it('timeout maps to ProviderError TIMEOUT class', async () => {
    await expect(
      adapter.authorize({
        organizationId: orgId,
        paymentIntentId: intentId,
        paymentAttemptId: attemptId,
        amountMinor: '100',
        currencyCode: 'SAR',
        idempotencyKey: 'TIMEOUT_KEY',
      }),
    ).rejects.toMatchObject({errorClass: 'TIMEOUT'});
    expect(shouldQueryBeforeRetry(new ProviderError('PAYTABS_TIMEOUT', 't', 'TIMEOUT', 504))).toBe(true);
  });

  it('capture is coalesced no-op for HPP sale', async () => {
    const cap = await adapter.capture({
      organizationId: orgId,
      paymentIntentId: intentId,
      providerReference: 'TST123',
      amountMinor: '100',
      currencyCode: 'SAR',
    });
    expect(cap.status).toBe('SUCCEEDED');
  });

  it('void returns NOT_AVAILABLE (not verified)', async () => {
    const v = await adapter.voidPayment({
      organizationId: orgId,
      paymentIntentId: intentId,
      providerReference: 'TST123',
    });
    expect(v.status).toBe('NOT_AVAILABLE');
  });
});
