import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {providerRouter} from '../apps/api/src/providers/router.js';
import {signPayTabsCallback} from '../apps/api/src/providers/paytabs/index.js';
import {providerWebhookService} from '../apps/api/src/providers/webhook-service.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

process.env.PAYTABS_ADAPTER_MODE = 'simulate';

const PASSWORD = 'SecurePass!123';

async function ensureMigrations() {
  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout || 'migrate failed');
}

async function registerUser(app: Fastify.FastifyInstance, email: string, orgName: string) {
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {email, password: PASSWORD, organization_name: orgName, name: 'PT User'},
  });
  expect(reg.statusCode).toBe(201);
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: {token: reg.json().data.email_verification_token},
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {email, password: PASSWORD},
  });
  return {token: login.json().data.access_token as string, orgId: reg.json().data.organization_id as string};
}

async function bindPayTabsRoute(orgId: string) {
  const acc = await pgQuery<{id: string}>(
    `SELECT pa.id FROM provider_accounts pa
     JOIN providers p ON p.id = pa.provider_id
     WHERE p.code='paytabs' AND pa.environment='SANDBOX' AND pa.organization_id IS NULL
     LIMIT 1`,
  );
  expect(acc.rows[0]?.id).toBeTruthy();
  await pgQuery(
    `INSERT INTO provider_routes (organization_id, environment, currency_code, provider_account_id, priority, is_active)
     VALUES ($1,'SANDBOX','SAR',$2,1,TRUE)
     ON CONFLICT DO NOTHING`,
    [orgId, acc.rows[0].id],
  );
}

describe('P15.3 PayTabs sandbox integration', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let token = '';
  let orgId = '';
  let linkToken = '';

  beforeAll(async () => {
    ready = await pgPing().catch(() => false);
    if (!ready) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') throw new Error('PostgreSQL required');
      return;
    }
    await ensureMigrations();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();

    const ts = Date.now();
    const user = await registerUser(app, `paytabs-${ts}@example.test`, 'PayTabs Merchant');
    token = user.token;
    orgId = user.orgId;
    await bindPayTabsRoute(orgId);

    await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${token}`},
      payload: {
        company_display_name: 'PayTabs Brand',
        default_success_url: 'https://example.test/success',
        default_cancel_url: 'https://example.test/cancel',
      },
    });

    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${token}`, 'idempotency-key': `pt-link-${ts}`},
      payload: {
        title: 'PayTabs Link',
        amount_mode: 'FIXED',
        amount_minor: '5000',
        currency_code: 'SAR',
        one_time: false,
        max_uses: 20,
      },
    });
    expect(link.statusCode).toBe(201);
    linkToken = link.json().data.public_token;
  }, 240_000);

  afterAll(async () => {
    await app.close().catch(() => undefined);
  });

  it('lists paytabs provider with adapter registered', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: {authorization: `Bearer ${token}`},
    });
    const paytabs = res.json().data.find((p: any) => p.code === 'paytabs');
    expect(paytabs?.adapter_registered).toBe(true);
    expect(paytabs?.supports_live).toBe(false);
  });

  it('router resolves paytabs when org route bound', async () => {
    if (!ready) return;
    const resolved = await providerRouter.resolve({
      organizationId: orgId,
      environment: 'SANDBOX',
      currencyCode: 'SAR',
      requiredCapability: 'payment.authorize',
    });
    expect(resolved.providerCode).toBe('paytabs');
  });

  it('checkout payment returns REQUIRES_ACTION for PayTabs HPP', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/session`,
      headers: {'idempotency-key': `pt-sess-${Date.now()}`},
      payload: {customer_email: 'buyer@example.test'},
    });
    expect(session.statusCode).toBe(201);
    const sessionToken = session.json().data.session.public_token;
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/payment`,
      headers: {'idempotency-key': `pt-pay-${Date.now()}`},
      payload: {session_token: sessionToken, payment_method_type_code: 'CARD'},
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('REQUIRES_ACTION');
    expect(pay.json().data.redirect_url || pay.json().data.action?.url).toBeTruthy();
  });

  it('webhook: valid PayTabs callback applies payment success', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/session`,
      headers: {'idempotency-key': `pt-wh-sess-${Date.now()}`},
      payload: {customer_email: 'wh@example.test'},
    });
    expect(session.statusCode).toBe(201);
    const sessionToken = session.json().data.session.public_token;
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/payment`,
      headers: {'idempotency-key': `pt-wh-pay-${Date.now()}`},
      payload: {session_token: sessionToken, payment_method_type_code: 'CARD'},
    });
    expect(pay.statusCode).toBe(200);
    const intentId = pay.json().data.intent.id;
    const tranRef = pay.json().data.provider_reference as string;

    const payload = signPayTabsCallback(
      {
        tran_ref: tranRef,
        cart_id: intentId.replace(/-/g, '').slice(0, 32),
        response_status: 'A',
        cart_amount: '50.00',
        cart_currency: 'SAR',
        payment_intent_id: intentId,
      },
      'SIM_SERVER_KEY',
    );
    const rawBody = JSON.stringify(payload);

    const piLookup = await pgQuery<{organization_id: string}>(
      `SELECT organization_id FROM payment_intents WHERE id=$1`,
      [intentId],
    );

    const ingest = await providerWebhookService.ingest({
      providerCode: 'paytabs',
      headers: {'content-type': 'application/json'},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(ingest.status).toBe('PROCESSED');
    expect(ingest.state_apply?.applied).toBe(true);

    const pi = await pgQuery<{status: string}>(`SELECT status FROM payment_intents WHERE id=$1`, [intentId]);
    expect(pi.rows[0]?.status).toBe('SUCCEEDED');

    // Duplicate webhook — idempotent
    const dup = await providerWebhookService.ingest({
      providerCode: 'paytabs',
      headers: {'content-type': 'application/json'},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(dup.status).toBe('DUPLICATE');
    void piLookup;
  });

  it('webhook: invalid signature rejected', async () => {
    if (!ready) return;
    const rawBody = JSON.stringify({tran_ref: 'TSTX', cart_id: 'c1', response_status: 'A', signature: 'bad'});
    await expect(
      providerWebhookService.ingest({
        providerCode: 'paytabs',
        headers: {},
        rawBody,
        environment: 'SANDBOX',
      }),
    ).rejects.toMatchObject({statusCode: 401});
  });

  it('provider idempotency — duplicate authorize key returns same result', async () => {
    if (!ready) return;
    const resolved = await providerRouter.resolve({
      organizationId: orgId,
      environment: 'SANDBOX',
      currencyCode: 'SAR',
      requiredCapability: 'payment.authorize',
    });
    const key = `pt-idem-${crypto.randomUUID()}`;
    const first = await providerRouter.run({
      resolved,
      operation: 'AUTHORIZE',
      paymentIntentId: null,
      paymentAttemptId: null,
      idempotencyKey: key,
      fn: () =>
        resolved.adapter.authorize({
          organizationId: orgId,
          paymentIntentId: crypto.randomUUID(),
          paymentAttemptId: crypto.randomUUID(),
          amountMinor: '1000',
          currencyCode: 'SAR',
        }),
    });
    expect(first.status).toBe('REQUIRES_ACTION');
    const second = await providerRouter.run({
      resolved,
      operation: 'AUTHORIZE',
      paymentIntentId: null,
      paymentAttemptId: null,
      idempotencyKey: key,
      fn: async () => {
        throw new Error('must not execute');
      },
    });
    expect(second.providerReference).toBe(first.providerReference);
  });
});
