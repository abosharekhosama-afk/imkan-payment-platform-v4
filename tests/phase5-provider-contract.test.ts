import {describe, expect, it} from 'vitest';
import {sandboxAdapter, signSandboxWebhook} from '../apps/api/src/providers/sandbox-adapter.js';
import {shouldQueryBeforeRetry, ProviderError} from '../apps/api/src/providers/errors.js';
import {config} from '../apps/api/src/config.js';

/**
 * Shared Provider Adapter contract tests — run against SandboxAdapter.
 * Real adapters must pass the same behavioral expectations before VERIFIED.
 */
describe('phase 5 provider contract — sandbox adapter', () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000010';
  const attemptId = '00000000-0000-4000-8000-000000000020';

  it('successful payment authorization', async () => {
    const result = await sandboxAdapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '1000',
      currencyCode: 'USD',
      paymentMethodToken: 'tok_ok',
    });
    expect(result.status).toBe('SUCCEEDED');
    expect(result.providerCode).toBe('sandbox');
    expect(result.providerReference).toBeTruthy();
    expect(result.providerTransactionId).toBeTruthy();
  });

  it('failed payment authorization', async () => {
    const result = await sandboxAdapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '1000',
      currencyCode: 'USD',
      paymentMethodToken: 'tok_FAIL',
    });
    expect(result.status).toBe('FAILED');
    expect(result.failureCode).toBe('SANDBOX_FORCE_FAIL');
  });

  it('ambiguous outcome requires query-before-retry', async () => {
    const result = await sandboxAdapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '1000',
      currencyCode: 'USD',
      paymentMethodToken: 'tok_AMBIGUOUS',
    });
    expect(result.status).toBe('AMBIGUOUS');
    const err = new ProviderError('SANDBOX_AMBIGUOUS', 'ambiguous', 'AMBIGUOUS', 409);
    expect(shouldQueryBeforeRetry(err)).toBe(true);
  });

  it('timeout is retryable / query-before-retry class', async () => {
    await expect(
      sandboxAdapter.authorize({
        organizationId: orgId,
        paymentIntentId: intentId,
        paymentAttemptId: attemptId,
        amountMinor: '1000',
        currencyCode: 'USD',
        paymentMethodToken: 'tok_TIMEOUT',
      }),
    ).rejects.toMatchObject({errorClass: 'TIMEOUT', retryable: true});
    expect(shouldQueryBeforeRetry(new ProviderError('PROVIDER_TIMEOUT', 't', 'TIMEOUT', 504))).toBe(true);
  });

  it('status lookup for known succeeded reference', async () => {
    const auth = await sandboxAdapter.authorize({
      organizationId: orgId,
      paymentIntentId: intentId,
      paymentAttemptId: attemptId,
      amountMinor: '500',
      currencyCode: 'USD',
      paymentMethodToken: 'tok_ok',
    });
    const status = await sandboxAdapter.getStatus({
      organizationId: orgId,
      providerReference: auth.providerReference!,
    });
    expect(status.status).toBe('SUCCEEDED');
  });

  it('refund succeeds on sandbox financial rail', async () => {
    const refund = await sandboxAdapter.refund({
      organizationId: orgId,
      paymentTransactionId: '00000000-0000-4000-8000-000000000099',
      amountMinor: '100',
      currencyCode: 'USD',
    });
    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.providerReference).toMatch(/^sbx_rf_/);
  });

  it('tokenize returns opaque reference', async () => {
    const tok = await sandboxAdapter.tokenize({organizationId: orgId, paymentMethodToken: 'pm_abc'});
    expect(tok.status).toBe('SUCCEEDED');
    expect(tok.providerReference).toMatch(/^sbx_pm_/);
  });

  it('webhook normalization with valid signature', async () => {
    const rawBody = JSON.stringify({
      type: 'sandbox.payment.succeeded',
      provider_reference: 'sbx_att_test',
      organization_id: orgId,
    });
    const eventId = `evt_${Date.now()}`;
    const nonce = `nonce_${Date.now()}`;
    const {headers} = signSandboxWebhook({
      rawBody,
      eventId,
      nonce,
      secret: config.sandboxWebhookSecret,
    });
    const verified = await sandboxAdapter.verifyWebhook({
      headers,
      rawBody,
      environment: 'SANDBOX',
    });
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.event.eventType).toBe('sandbox.payment.succeeded');
      expect(verified.event.providerEventId).toBe(eventId);
    }
  });

  it('invalid webhook signature rejected (never bypass)', async () => {
    const rawBody = JSON.stringify({type: 'sandbox.payment.succeeded'});
    const verified = await sandboxAdapter.verifyWebhook({
      headers: {
        'x-sandbox-signature': 'sha256=deadbeef',
        'x-sandbox-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-sandbox-event-id': 'evt_bad',
        'x-sandbox-nonce': 'nonce_bad',
      },
      rawBody,
      environment: 'SANDBOX',
    });
    expect(verified.valid).toBe(false);
    if (!verified.valid) expect(verified.error).toMatch(/Invalid webhook signature/i);
  });

  it('LIVE environment rejected by sandbox adapter', async () => {
    const rawBody = '{}';
    const verified = await sandboxAdapter.verifyWebhook({
      headers: {},
      rawBody,
      environment: 'LIVE',
    });
    expect(verified.valid).toBe(false);
  });

  it('capture / void succeed for sandbox', async () => {
    const cap = await sandboxAdapter.capture({
      organizationId: orgId,
      paymentIntentId: intentId,
      providerReference: 'sbx_att_x',
      amountMinor: '100',
      currencyCode: 'USD',
    });
    expect(cap.status).toBe('SUCCEEDED');
    const v = await sandboxAdapter.voidPayment({
      organizationId: orgId,
      paymentIntentId: intentId,
      providerReference: 'sbx_att_x',
    });
    expect(v.status).toBe('SUCCEEDED');
  });
});
