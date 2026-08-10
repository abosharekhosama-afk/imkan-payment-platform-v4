import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {signSandboxWebhook} from '../apps/api/src/providers/sandbox-adapter.js';
import {providerRouter} from '../apps/api/src/providers/router.js';
import {resetRateLimitCounters} from '../apps/api/src/foundation/rate-limit.js';
import {config} from '../apps/api/src/config.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import {issueStepUpToken} from './helpers/step-up.js';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';
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

describe('phase 5 providers / webhooks / api keys /api/v1', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let ownerToken = '';
  let ownerOrg = '';
  let otherToken = '';
  let otherOrg = '';
  let linkToken = '';

  async function register(email: string, orgName: string) {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password: PASSWORD, organization_name: orgName, name: 'User'},
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
    expect(login.statusCode).toBe(200);
    return {token: login.json().data.access_token as string, orgId: reg.json().data.organization_id as string};
  }

  beforeAll(async () => {
    try {
      ready = await pgPing();
    } catch {
      ready = false;
    }
    if (!ready) {
      if (required) throw new Error('PostgreSQL required');
      return;
    }
    await ensureMigrations();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();

    const ts = Date.now();
    const owner = await register(`p5-owner-${ts}@example.test`, 'Phase5 Merchant');
    ownerToken = owner.token;
    ownerOrg = owner.orgId;
    const other = await register(`p5-other-${ts}@example.test`, 'Phase5 Other');
    otherToken = other.token;
    otherOrg = other.orgId;

    await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {company_display_name: 'P5 Brand', default_success_url: 'https://example.test/ok'},
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p5-link-${ts}`},
      payload: {
        title: 'P5 Link',
        amount_mode: 'FIXED',
        amount_minor: '2500',
        currency_code: 'SAR',
      },
    });
    expect(link.statusCode).toBe(201);
    linkToken = link.json().data.public_token;
  }, 240_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('lists sandbox provider with capability evidence statuses', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(res.statusCode).toBe(200);
    const sandbox = res.json().data.find((p: any) => p.code === 'sandbox');
    expect(sandbox).toBeTruthy();
    expect(sandbox.supports_live).toBe(false);
    expect(sandbox.adapter_registered).toBe(true);

    const caps = await app.inject({
      method: 'GET',
      url: '/api/v1/providers/sandbox/capabilities',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(caps.statusCode).toBe(200);
    const refund = caps.json().data.find((c: any) => c.capability_code === 'payment.refund');
    expect(refund?.evidence_status).toBe('VERIFIED');
    const authz = caps.json().data.find((c: any) => c.capability_code === 'payment.authorize');
    expect(authz?.evidence_status).toBe('VERIFIED');
  });

  it('router resolves platform sandbox and records provider_transactions (idempotent)', async () => {
    if (!ready) return;
    const resolved = await providerRouter.resolve({
      organizationId: ownerOrg,
      environment: 'SANDBOX',
      currencyCode: 'USD',
      requiredCapability: 'payment.authorize',
    });
    expect(resolved.providerCode).toBe('sandbox');
    expect(resolved.environment).toBe('SANDBOX');

    const key = `p5-idem-${crypto.randomUUID()}`;
    const first = await providerRouter.run({
      resolved,
      operation: 'AUTHORIZE',
      idempotencyKey: key,
      fn: () =>
        resolved.adapter.authorize({
          organizationId: ownerOrg,
          paymentIntentId: crypto.randomUUID(),
          paymentAttemptId: crypto.randomUUID(),
          amountMinor: '100',
          currencyCode: 'USD',
          paymentMethodToken: 'tok_ok',
        }),
    });
    expect(first.status).toBe('SUCCEEDED');
    const second = await providerRouter.run({
      resolved,
      operation: 'AUTHORIZE',
      idempotencyKey: key,
      fn: async () => {
        throw new Error('must not re-execute');
      },
    });
    expect(second.status).toBe('SUCCEEDED');
    expect(second.providerReference).toBe(first.providerReference);
  });

  it('LIVE environment cannot use sandbox provider', async () => {
    if (!ready) return;
    await expect(
      providerRouter.resolve({
        organizationId: ownerOrg,
        environment: 'LIVE',
        requiredCapability: 'payment.authorize',
      }),
    ).rejects.toMatchObject({code: expect.stringMatching(/PROVIDER_ROUTE_NOT_FOUND|PROVIDER_LIVE_UNSUPPORTED/)});
  });

  it('checkout payment flows through Router → Sandbox Adapter', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/session`,
      headers: {'idempotency-key': `p5-sess-${Date.now()}`},
      payload: {customer_email: 'buyer@p5.test'},
    });
    expect(session.statusCode).toBe(201);
    expect(session.json().data.provider.code).toBe('sandbox');

    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/payment`,
      headers: {'idempotency-key': `p5-pay-${Date.now()}`},
      payload: {
        session_token: session.json().data.session.public_token,
        payment_method_type_code: 'CARD',
        payment_method_token: 'tok_ok',
      },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('SUCCEEDED');

    const txns = await pgQuery(
      `SELECT operation, status, provider_id FROM provider_transactions WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 5`,
      [ownerOrg],
    );
    expect(txns.rows.some((r) => r.operation === 'AUTHORIZE' && r.status === 'SUCCEEDED')).toBe(true);
  });

  it('ambiguous payment returns query_before_retry and does not succeed', async () => {
    if (!ready) return;
    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p5-amb-${Date.now()}`},
      payload: {
        title: 'Ambiguous',
        amount_mode: 'FIXED',
        amount_minor: '1100',
        currency_code: 'SAR',
      },
    });
    const token = link.json().data.public_token;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${token}/session`,
      headers: {'idempotency-key': `p5-amb-sess-${Date.now()}`},
      payload: {},
    });
    expect(session.statusCode).toBe(201);
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${token}/payment`,
      headers: {'idempotency-key': `p5-amb-pay-${Date.now()}`},
      payload: {
        session_token: session.json().data.session.public_token,
        payment_method_token: 'tok_AMBIGUOUS',
      },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('FAILED');
    expect(pay.json().data.query_before_retry).toBe(true);
  });

  it('webhook: valid signature → processed + outbox; invalid rejected; replay/duplicate handled', async () => {
    if (!ready) return;
    const rawBody = JSON.stringify({
      type: 'sandbox.payment.succeeded',
      payment_intent_id: (
        await pgQuery(
          `SELECT id FROM payment_intents WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1`,
          [ownerOrg],
        )
      ).rows[0]?.id,
      provider_reference: 'sbx_att_webhook',
    });
    expect(JSON.parse(rawBody).payment_intent_id).toBeTruthy();
    const eventId = `evt_${crypto.randomUUID()}`;
    const nonce = `n_${crypto.randomUUID()}`;
    const {headers} = signSandboxWebhook({rawBody, eventId, nonce, secret: config.sandboxWebhookSecret});

    const ok1 = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/providers/sandbox',
      headers: {...headers, 'content-type': 'application/json'},
      payload: rawBody,
    });
    expect([200, 202]).toContain(ok1.statusCode);
    expect(['PROCESSED', 'DUPLICATE']).toContain(ok1.json().data.status);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/providers/sandbox',
      headers: {...headers, 'content-type': 'application/json'},
      payload: rawBody,
    });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().data.status).toBe('DUPLICATE');

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/providers/sandbox',
      headers: {
        'content-type': 'application/json',
        'x-sandbox-signature': 'sha256=00',
        'x-sandbox-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-sandbox-event-id': `evt_bad_${Date.now()}`,
        'x-sandbox-nonce': `n_bad_${Date.now()}`,
      },
      payload: rawBody,
    });
    expect(bad.statusCode).toBe(401);

    const row = await pgQuery(
      `SELECT signature_valid, processing_status FROM provider_webhook_events WHERE provider_event_id=$1`,
      [eventId],
    );
    expect(row.rows[0].signature_valid).toBe(true);
    expect(row.rows[0].processing_status).toBe('DUPLICATE');

    const outbox = await pgQuery(
      `SELECT event_type FROM outbox_events WHERE event_type='provider.webhook.received' AND organization_id=$1 LIMIT 1`,
      [ownerOrg],
    );
    expect(outbox.rows.length).toBeGreaterThan(0);

    // Replayed nonce with new event id
    const eventId2 = `evt_${crypto.randomUUID()}`;
    const {headers: h2} = signSandboxWebhook({
      rawBody,
      eventId: eventId2,
      nonce, // same nonce
      secret: config.sandboxWebhookSecret,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/providers/sandbox',
      headers: {...h2, 'content-type': 'application/json'},
      payload: rawBody,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.status).toBe('DUPLICATE');
    expect(replay.json().data.reason).toBe('nonce_replay');
  });

  it('API keys: create (hashed), authenticate, revoke, tenant isolation', async () => {
    if (!ready) return;
    const stepUp = await issueStepUpToken(app, ownerToken);
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: {authorization: `Bearer ${ownerToken}`, 'x-step-up-token': stepUp},
      payload: {
        name: 'Test Key',
        environment: 'SANDBOX',
        scopes: ['providers.read', 'payments.read'],
      },
    });
    expect(created.statusCode).toBe(201);
    const secret = created.json().data.secret as string;
    expect(secret.startsWith('pk_test_')).toBe(true);
    expect(created.json().data.key_hash).toBeUndefined();

    const hashRow = await pgQuery(`SELECT key_hash FROM api_keys WHERE id=$1`, [created.json().data.id]);
    expect(hashRow.rows[0].key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRow.rows[0].key_hash).not.toBe(secret);

    const viaKey = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: {authorization: `Api-Key ${secret}`},
    });
    expect(viaKey.statusCode).toBe(200);

    const cross = await app.inject({
      method: 'GET',
      url: '/api/v1/provider-webhooks',
      headers: {authorization: `Api-Key ${secret}`},
    });
    // key has webhooks.read? no — should 403
    expect(cross.statusCode).toBe(403);

    const otherList = await app.inject({
      method: 'GET',
      url: '/api/v1/api-keys',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().data.find((k: any) => k.id === created.json().data.id)).toBeUndefined();

    const stepUpRevoke = await issueStepUpToken(app, ownerToken);
    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v1/api-keys/${created.json().data.id}/revoke`,
      headers: {authorization: `Bearer ${ownerToken}`, 'x-step-up-token': stepUpRevoke},
    });
    expect(revoke.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: {authorization: `Api-Key ${secret}`},
    });
    expect(after.statusCode).toBe(401);

    // LIVE keys blocked without opt-in
    const stepUpLive = await issueStepUpToken(app, ownerToken);
    const live = await app.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      headers: {authorization: `Bearer ${ownerToken}`, 'x-step-up-token': stepUpLive},
      payload: {name: 'Live', environment: 'LIVE', scopes: ['payments.read']},
    });
    expect(live.statusCode).toBe(403);
  });

  it('rate limiting enforces sensitive api_keys.manage bucket', async () => {
    if (!ready) return;
    resetRateLimitCounters();
    let limited = false;
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/api-keys',
        headers: {authorization: `Bearer ${ownerToken}`},
      });
      if (res.statusCode === 429) {
        limited = true;
        expect(res.json().error.code).toBe('RATE_LIMITED');
        break;
      }
      expect(res.statusCode).toBe(200);
    }
    expect(limited).toBe(true);
    resetRateLimitCounters();
  });

  it('tenant cannot read other org webhook events', async () => {
    if (!ready) return;
    const ownerEvents = await pgQuery(
      `SELECT count(*)::int AS c FROM provider_webhook_events WHERE organization_id=$1`,
      [ownerOrg],
    );
    expect(ownerEvents.rows[0].c).toBeGreaterThan(0);

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/provider-webhooks',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.filter((w: any) => w.organization_id === ownerOrg).length).toBe(0);
    expect(otherOrg).toBeTruthy();
  });
});
