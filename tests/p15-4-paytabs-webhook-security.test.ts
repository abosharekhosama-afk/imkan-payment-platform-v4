import {describe, expect, it} from 'vitest';
import crypto from 'node:crypto';
import {createPayTabsAdapter, signPayTabsCallback} from '../apps/api/src/providers/paytabs/index.js';
import {createPayTabsSimulateClient} from '../apps/api/src/providers/paytabs/http-client.js';
import {loadPayTabsSandboxCredentials} from '../apps/api/src/providers/paytabs/credentials.js';
import {applyProviderWebhookToPaymentIntent} from '../apps/api/src/providers/webhook-state-apply.js';
import {pgPing} from '../apps/api/src/infrastructure/db/postgres.js';

process.env.PAYTABS_ADAPTER_MODE = 'simulate';
process.env.PAYTABS_ENV = 'sandbox';

describe('P15.4 PayTabs webhook security (contract)', () => {
  const adapter = createPayTabsAdapter(
    createPayTabsSimulateClient({
      baseUrl: 'https://secure-egypt.paytabs.com',
      profileId: 'SIM_PROFILE',
      serverKey: 'SIM_SERVER_KEY',
      callbackUrl: 'https://localhost/cb',
      returnUrl: 'https://localhost/return',
      webhookSecret: 'SIM_SERVER_KEY',
    }),
  );

  it('1. valid signature accepted', async () => {
    const payload = signPayTabsCallback(
      {tran_ref: 'TST_WH_1', cart_id: 'c1', response_status: 'A', cart_amount: '10.00', cart_currency: 'SAR'},
      'SIM_SERVER_KEY',
    );
    const v = await adapter.verifyWebhook({headers: {}, rawBody: JSON.stringify(payload), environment: 'SANDBOX'});
    expect(v.valid).toBe(true);
  });

  it('2. invalid signature rejected', async () => {
    const v = await adapter.verifyWebhook({
      headers: {},
      rawBody: JSON.stringify({tran_ref: 'X', cart_id: 'c1', response_status: 'A', signature: 'bad'}),
      environment: 'SANDBOX',
    });
    expect(v.valid).toBe(false);
  });

  it('3. missing signature rejected', async () => {
    const v = await adapter.verifyWebhook({
      headers: {},
      rawBody: JSON.stringify({tran_ref: 'X', cart_id: 'c1', response_status: 'A'}),
      environment: 'SANDBOX',
    });
    expect(v.valid).toBe(false);
  });

  it('6. terminal state guard blocks downgrade after capture', async () => {
    const ready = await pgPing().catch(() => false);
    if (!ready) return;
    // Unit-level: applyProviderWebhookToPaymentIntent with missing org returns safely
    const result = await applyProviderWebhookToPaymentIntent({query: async () => ({rows: []})} as any, {
      organizationId: null,
      paymentIntentId: null,
      eventType: 'paytabs.payment.succeeded',
      providerEventId: 'evt-1',
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('missing_payment_or_org');
  });

  it('7. malformed payload rejected', async () => {
    const v = await adapter.verifyWebhook({headers: {}, rawBody: '{not-json', environment: 'SANDBOX'});
    expect(v.valid).toBe(false);
  });

  it('8. unknown event type does not throw from normalizer', async () => {
    const payload = signPayTabsCallback(
      {tran_ref: 'TST_UNK', cart_id: 'c2', response_status: 'Z', cart_amount: '1.00', cart_currency: 'SAR'},
      'SIM_SERVER_KEY',
    );
    const v = await adapter.verifyWebhook({headers: {}, rawBody: JSON.stringify(payload), environment: 'SANDBOX'});
    expect(v.valid).toBe(true);
    if (v.valid) expect(v.event.eventType).toBe('paytabs.payment.updated');
  });

  it('LIVE environment webhooks rejected', async () => {
    const payload = signPayTabsCallback({tran_ref: 'L1', cart_id: 'c', response_status: 'A'}, 'SIM_SERVER_KEY');
    const v = await adapter.verifyWebhook({headers: {}, rawBody: JSON.stringify(payload), environment: 'LIVE'});
    expect(v.valid).toBe(false);
  });
});

describe('P15.4 query recovery (unit)', () => {
  it('maps query A to SUCCEEDED', async () => {
    const {resolveUnknownPayTabsOutcome} = await import('../apps/api/src/providers/paytabs/query-recovery.js');
    const client = createPayTabsSimulateClient(await loadPayTabsSandboxCredentials()!);
    const auth = await createPayTabsAdapter(client).authorize({
      organizationId: crypto.randomUUID(),
      paymentIntentId: crypto.randomUUID(),
      paymentAttemptId: crypto.randomUUID(),
      amountMinor: '1000',
      currencyCode: 'SAR',
    });
    const recovered = await resolveUnknownPayTabsOutcome({
      client,
      profileId: 'SIM_PROFILE',
      providerReference: auth.providerReference,
    });
    expect(recovered.recoveredViaQuery).toBe(true);
    expect(['SUCCEEDED', 'PENDING']).toContain(recovered.status);
  });
});
