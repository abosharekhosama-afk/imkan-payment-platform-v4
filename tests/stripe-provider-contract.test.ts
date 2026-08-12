import {beforeEach, describe, expect, it} from 'vitest';
import {
  assertStripePlaneAllowed,
  classifyStripeSecretKey,
  isStripeLiveAllowed,
  resolveStripeRequestedPlane,
} from '../apps/api/src/providers/stripe/config.js';
import {createStripeClient} from '../apps/api/src/providers/stripe/http-client.js';
import {mapCheckoutSession, mapStripePaymentIntentStatus} from '../apps/api/src/providers/stripe/mappers.js';
import {signStripePayload, verifyStripeSignature} from '../apps/api/src/providers/stripe/webhook.js';
import {StripeAdapter} from '../apps/api/src/providers/stripe/adapter.js';
import {listRegisteredAdapterCodes} from '../apps/api/src/providers/registry.js';
import {getCapabilityProfile} from '../apps/api/src/providers/capability-matrix.js';

describe('Stripe V4 adapter', () => {
  beforeEach(() => {
    delete process.env.STRIPE_ENV;
    delete process.env.APP_ENV;
    delete process.env.STRIPE_ALLOW_LIVE;
    delete process.env.STRIPE_ADAPTER_MODE;
  });

  it('registers stripe in the provider registry', () => {
    expect(listRegisteredAdapterCodes()).toContain('stripe');
  });

  it('exposes capability profile', () => {
    const profile = getCapabilityProfile('stripe');
    expect(profile.found).toBe(true);
    expect(profile.capabilities?.payment).toBe(true);
    expect(profile.capabilities?.webhooks).toBe(true);
  });

  it('defaults plane to test/sandbox', () => {
    expect(resolveStripeRequestedPlane()).toBe('test');
  });

  it('classifies secret keys', () => {
    expect(classifyStripeSecretKey('sk_test_abc')).toBe('test');
    expect(classifyStripeSecretKey('sk_live_abc')).toBe('live');
    expect(classifyStripeSecretKey('rk_test')).toBe('invalid');
  });

  it('blocks live key on test plane', () => {
    expect(() => assertStripePlaneAllowed('sk_live_abc', 'test')).toThrow(/LIVE key refused/i);
  });

  it('blocks live plane without STRIPE_ALLOW_LIVE', () => {
    expect(isStripeLiveAllowed()).toBe(false);
    expect(() => assertStripePlaneAllowed('sk_live_abc', 'live')).toThrow(/STRIPE_ALLOW_LIVE/i);
  });

  it('allows live plane when gated', () => {
    process.env.STRIPE_ALLOW_LIVE = 'true';
    expect(() => assertStripePlaneAllowed('sk_live_abc', 'live')).not.toThrow();
  });

  it('simulate authorize returns hosted Checkout redirect', async () => {
    process.env.STRIPE_ADAPTER_MODE = 'simulate';
    process.env.STRIPE_CHECKOUT_UI = 'hosted';
    const adapter = new StripeAdapter();
    const result = await adapter.authorize({
      organizationId: 'org',
      paymentIntentId: '11111111-1111-1111-1111-111111111111',
      paymentAttemptId: '22222222-2222-2222-2222-222222222222',
      amountMinor: '2500',
      currencyCode: 'usd',
    });
    expect(result.status).toBe('REQUIRES_ACTION');
    expect(result.details?.redirect_url).toMatch(/checkout\.stripe\.com/);
    expect(result.providerReference).toBeTruthy();
  });

  it('simulate authorize returns PaymentIntent client_secret in elements mode', async () => {
    process.env.STRIPE_ADAPTER_MODE = 'simulate';
    process.env.STRIPE_CHECKOUT_UI = 'elements';
    const adapter = new StripeAdapter();
    const result = await adapter.authorize({
      organizationId: 'org',
      paymentIntentId: '11111111-1111-1111-1111-111111111111',
      paymentAttemptId: '22222222-2222-2222-2222-222222222222',
      amountMinor: '2500',
      currencyCode: 'usd',
    });
    expect(result.status).toBe('REQUIRES_ACTION');
    expect(result.details?.embedded).toBe(true);
    expect(result.details?.client_secret).toMatch(/secret/);
    expect(result.providerReference).toMatch(/^pi_/);
  });

  it('simulate refund succeeds', async () => {
    process.env.STRIPE_ADAPTER_MODE = 'simulate';
    const adapter = new StripeAdapter();
    const result = await adapter.refund({
      organizationId: 'org',
      paymentTransactionId: 'pi_test_sim_abc',
      amountMinor: '500',
      currencyCode: 'usd',
    });
    expect(result.status).toBe('SUCCEEDED');
  });

  it('verifies Stripe webhook signatures', () => {
    const secret = 'whsec_' + Buffer.from('test_secret_value_123456').toString('base64');
    const body = JSON.stringify({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      livemode: false,
      data: {object: {id: 'cs_test', payment_intent: 'pi_test', client_reference_id: 'pi-uuid'}},
    });
    const header = signStripePayload(body, secret);
    expect(verifyStripeSignature(body, header, secret)).toBe(true);
    expect(verifyStripeSignature(body, header, 'whsec_wrong')).toBe(false);
  });

  it('maps payment intent statuses', () => {
    expect(mapStripePaymentIntentStatus('succeeded')).toBe('SUCCEEDED');
    expect(mapStripePaymentIntentStatus('requires_action')).toBe('REQUIRES_ACTION');
    expect(mapStripePaymentIntentStatus('canceled')).toBe('FAILED');
  });

  it('maps checkout session with url to REQUIRES_ACTION', () => {
    const mapped = mapCheckoutSession({
      id: 'cs_x',
      url: 'https://checkout.stripe.com/c/pay/cs_x',
      payment_intent: 'pi_x',
    });
    expect(mapped.status).toBe('REQUIRES_ACTION');
    expect(mapped.details?.redirect_url).toContain('checkout.stripe.com');
  });

  it('simulate client creates refund', async () => {
    const client = createStripeClient(
      {
        secretKey: 'SIM_STRIPE_SECRET',
        webhookSecret: 'SIM_WEBHOOK',
        successUrl: 'https://example.test/ok',
        cancelUrl: 'https://example.test/cancel',
        isLiveKey: false,
      },
      'simulate',
    );
    const refund = await client.createRefund({paymentIntentId: 'pi_x', amountMinor: '100'});
    expect(refund.status).toBe('succeeded');
  });
});
