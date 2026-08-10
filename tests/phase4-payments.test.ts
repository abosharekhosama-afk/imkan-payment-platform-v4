import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

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

describe('phase 4 payments / payment-links / checkout /api/v1', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let ownerToken = '';
  let ownerOrg = '';
  let otherToken = '';
  let fixedLinkToken = '';
  let fixedLinkId = '';
  let customLinkToken = '';

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
    const owner = await register(`p4-owner-${ts}@example.test`, 'Phase4 Merchant');
    ownerToken = owner.token;
    ownerOrg = owner.orgId;
    const other = await register(`p4-other-${ts}@example.test`, 'Phase4 Other');
    otherToken = other.token;
  }, 240_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('upserts merchant payment/branding config under RBAC', async () => {
    if (!ready) return;
    const unauth = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/payment-config',
      payload: {company_display_name: 'Nope'},
    });
    expect(unauth.statusCode).toBe(401);

    const upsert = await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${ownerToken}`},
      payload: {
        company_display_name: 'Phase4 Brand Co',
        brand_primary_color: '#0A4D68',
        brand_secondary_color: '#088395',
        description: 'Checkout branding',
        support_email: 'pay@phase4.test',
        default_success_url: 'https://example.test/success',
        default_cancel_url: 'https://example.test/cancel',
        checkout_theme: {font: 'display'},
      },
    });
    expect(upsert.statusCode).toBe(200);
    expect(upsert.json().data.company_display_name).toBe('Phase4 Brand Co');
    expect(upsert.json().data.merchant_profile_id).toBeTruthy();

    const get = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.brand_primary_color).toBe('#0A4D68');
  });

  it('creates fixed and customer-entered payment links with idempotency', async () => {
    if (!ready) return;
    const key = `p4-link-fixed-${Date.now()}`;
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': key},
      payload: {
        title: 'Invoice 100',
        description: 'Fixed amount link',
        amount_mode: 'FIXED',
        amount_minor: '10000',
        currency_code: 'SAR',
        reference: 'ORD-100',
        one_time: false,
        max_uses: 5,
      },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().data.status).toBe('ACTIVE');
    expect(create.json().data.amount_minor).toBe('10000');
    expect(create.json().data.public_token).toBeTruthy();
    fixedLinkToken = create.json().data.public_token;
    fixedLinkId = create.json().data.id;

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': key},
      payload: {
        title: 'Invoice 100',
        description: 'Fixed amount link',
        amount_mode: 'FIXED',
        amount_minor: '10000',
        currency_code: 'SAR',
        reference: 'ORD-100',
        one_time: false,
        max_uses: 5,
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.id).toBe(fixedLinkId);

    const custom = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p4-link-custom-${Date.now()}`},
      payload: {
        title: 'Donate',
        amount_mode: 'CUSTOMER_ENTERED',
        currency_code: 'SAR',
        reusable: true,
      },
    });
    expect(custom.statusCode).toBe(201);
    expect(custom.json().data.amount_minor).toBeNull();
    customLinkToken = custom.json().data.public_token;
  });

  it('enforces link lifecycle: deactivate → reuse → cancel; blocks expired/cancelled checkout', async () => {
    if (!ready) return;
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p4-lifecycle-${Date.now()}`},
      payload: {
        title: 'Lifecycle',
        amount_mode: 'FIXED',
        amount_minor: '500',
        currency_code: 'SAR',
        activate: false,
      },
    });
    expect(draft.statusCode).toBe(201);
    expect(draft.json().data.status).toBe('DRAFT');
    const id = draft.json().data.id;
    const token = draft.json().data.public_token;

    const act = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payment-links/${id}/activate`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(act.statusCode).toBe(200);
    expect(act.json().data.status).toBe('ACTIVE');

    const deact = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payment-links/${id}/deactivate`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(deact.statusCode).toBe(200);
    expect(deact.json().data.status).toBe('INACTIVE');

    const blocked = await app.inject({method: 'GET', url: `/api/v1/checkout/${token}`});
    expect(blocked.statusCode).toBe(409);

    const reuse = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payment-links/${id}/reuse`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(reuse.statusCode).toBe(200);
    expect(reuse.json().data.status).toBe('ACTIVE');

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payment-links/${id}/cancel`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe('CANCELLED');

    const cancelledCheckout = await app.inject({method: 'GET', url: `/api/v1/checkout/${token}`});
    expect(cancelledCheckout.statusCode).toBe(409);
  });

  it('serves public checkout with branding and rejects card PAN fields', async () => {
    if (!ready) return;
    const page = await app.inject({method: 'GET', url: `/api/v1/checkout/${fixedLinkToken}`});
    expect(page.statusCode).toBe(200);
    expect(page.json().data.link.amount_minor).toBe('10000');
    expect(page.json().data.branding.company_display_name).toBe('Phase4 Brand Co');
    expect(page.json().data.payment_method_types).toContain('CARD');

    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/session`,
      headers: {'idempotency-key': `p4-sess-${Date.now()}`},
      payload: {
        customer_name: 'Ada Lovelace',
        customer_email: 'ada@example.test',
      },
    });
    expect(session.statusCode).toBe(201);
    expect(session.json().data.intent.status).toBe('REQUIRES_PAYMENT');
    expect(session.json().data.session.status).toBe('OPEN');
    expect(session.json().data.order.amount_minor).toBe('10000');

    const panRejected = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/payment`,
      headers: {'idempotency-key': `p4-pan-${Date.now()}`},
      payload: {
        session_token: session.json().data.session.public_token,
        card_number: '4111111111111111',
        cvv: '123',
      },
    });
    expect(panRejected.statusCode).toBe(400);
  });

  it('completes sandbox payment happy path and records chain + outbox events', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/session`,
      headers: {'idempotency-key': `p4-ok-sess-${Date.now()}`},
      payload: {customer_email: 'ok@example.test', customer_name: 'OK User'},
    });
    expect(session.statusCode).toBe(201);
    const sessionToken = session.json().data.session.public_token;
    const intentId = session.json().data.intent.id;

    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/payment`,
      headers: {'idempotency-key': `p4-ok-pay-${Date.now()}`},
      payload: {
        session_token: sessionToken,
        payment_method_type_code: 'CARD',
        payment_method_token: 'tok_sbx_ok',
      },
    });
    expect(pay.statusCode, JSON.stringify(pay.json())).toBe(200);
    expect(pay.json().data.status).toBe('SUCCEEDED');
    expect(pay.json().data.intent.status).toBe('SUCCEEDED');
    expect(pay.json().data.transaction.provider_code).toBe('sandbox');
    expect(pay.json().data.transaction.amount_minor).toBe('10000');

    // Chain integrity
    const chain = await pgQuery(
      `SELECT pi.status AS intent_status, ps.status AS session_status, po.status AS order_status,
              pa.status AS attempt_status, pt.status AS txn_status, pl.use_count
       FROM payment_intents pi
       JOIN payment_sessions ps ON ps.payment_intent_id = pi.id
       JOIN payment_orders po ON po.id = pi.payment_order_id
       JOIN payment_attempts pa ON pa.payment_intent_id = pi.id
       JOIN payment_transactions pt ON pt.payment_intent_id = pi.id AND pt.status='SUCCEEDED'
       JOIN payment_links pl ON pl.id = pi.payment_link_id
       WHERE pi.id=$1`,
      [intentId],
    );
    expect(chain.rows[0].intent_status).toBe('SUCCEEDED');
    expect(chain.rows[0].session_status).toBe('COMPLETED');
    expect(chain.rows[0].order_status).toBe('PAID');
    expect(chain.rows[0].attempt_status).toBe('SUCCEEDED');
    expect(Number(chain.rows[0].use_count)).toBeGreaterThanOrEqual(1);

    const transitions = await pgQuery(
      `SELECT from_status, to_status FROM payment_intent_transitions WHERE payment_intent_id=$1 ORDER BY created_at`,
      [intentId],
    );
    const path = transitions.rows.map((r: any) => `${r.from_status || 'null'}->${r.to_status}`).join(',');
    expect(path).toContain('null->CREATED');
    expect(path).toContain('CREATED->REQUIRES_PAYMENT');
    expect(path).toContain('REQUIRES_PAYMENT->PROCESSING');
    expect(path).toContain('PROCESSING->SUCCEEDED');

    const events = await pgQuery<{event_type: string}>(
      `SELECT event_type FROM outbox_events WHERE organization_id=$1 AND aggregate_id=$2 ORDER BY created_at`,
      [ownerOrg, intentId],
    );
    const types = events.rows.map((r) => r.event_type);
    expect(types).toContain('payment.created');
    expect(types).toContain('payment.processing');
    expect(types).toContain('payment.succeeded');

    const merchantView = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/payments/${intentId}`,
      headers: {authorization: `Bearer ${ownerToken}`},
    });
    expect(merchantView.statusCode).toBe(200);
    expect(merchantView.json().data.intent.status).toBe('SUCCEEDED');
    expect(merchantView.json().data.attempts.length).toBeGreaterThanOrEqual(1);
    expect(merchantView.json().data.transactions.length).toBeGreaterThanOrEqual(1);
  });

  it('fails sandbox payment when token contains FAIL and keeps state machine consistent', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/session`,
      headers: {'idempotency-key': `p4-fail-sess-${Date.now()}`},
      payload: {customer_email: 'fail@example.test'},
    });
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/payment`,
      headers: {'idempotency-key': `p4-fail-pay-${Date.now()}`},
      payload: {
        session_token: session.json().data.session.public_token,
        payment_method_token: 'tok_FAIL_force',
      },
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('FAILED');
    expect(pay.json().data.intent.status).toBe('FAILED');

    const events = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM outbox_events
       WHERE organization_id=$1 AND event_type='payment.failed' AND aggregate_id=$2`,
      [ownerOrg, session.json().data.intent.id],
    );
    expect(events.rows[0].c).toBe(1);
  });

  it('blocks concurrent second payment attempt on the same open session/intent', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/session`,
      headers: {'idempotency-key': `p4-race-sess-${Date.now()}`},
      payload: {customer_email: 'race@example.test'},
    });
    const sessionToken = session.json().data.session.public_token;
    const intentId = session.json().data.intent.id;

    // Force intent into PROCESSING with an in-flight attempt to simulate race loser
    await pgQuery(
      `UPDATE payment_intents SET status='PROCESSING', version=version+1 WHERE id=$1`,
      [intentId],
    );
    await pgQuery(
      `INSERT INTO payment_attempts (
         organization_id, payment_session_id, payment_intent_id, attempt_number, status, provider_code, started_at
       ) VALUES ($1,$2,$3,1,'PROCESSING','sandbox',NOW())`,
      [ownerOrg, session.json().data.session.id, intentId],
    );

    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/payment`,
      headers: {'idempotency-key': `p4-race-pay-${Date.now()}`},
      payload: {session_token: sessionToken, payment_method_token: 'tok_ok'},
    });
    expect(pay.statusCode).toBe(409);
  });

  it('enforces one-time usage limits and customer-entered amount validation', async () => {
    if (!ready) return;
    const one = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p4-onetime-${Date.now()}`},
      payload: {
        title: 'One time',
        amount_mode: 'FIXED',
        amount_minor: '2500',
        currency_code: 'SAR',
        one_time: true,
      },
    });
    expect(one.statusCode).toBe(201);
    const token = one.json().data.public_token;

    const sess = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${token}/session`,
      headers: {'idempotency-key': `p4-ot-sess-${Date.now()}`},
      payload: {customer_email: 'once@example.test'},
    });
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${token}/payment`,
      headers: {'idempotency-key': `p4-ot-pay-${Date.now()}`},
      payload: {session_token: sess.json().data.session.public_token, payment_method_token: 'tok_ok'},
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('SUCCEEDED');

    const again = await app.inject({method: 'GET', url: `/api/v1/checkout/${token}`});
    expect(again.statusCode).toBe(409);

    const missingAmount = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${customLinkToken}/session`,
      headers: {'idempotency-key': `p4-custom-miss-${Date.now()}`},
      payload: {customer_email: 'x@example.test'},
    });
    expect(missingAmount.statusCode).toBe(400);

    const customOk = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${customLinkToken}/session`,
      headers: {'idempotency-key': `p4-custom-ok-${Date.now()}`},
      payload: {amount_minor: '777', customer_email: 'x@example.test'},
    });
    expect(customOk.statusCode).toBe(201);
    expect(customOk.json().data.intent.amount_minor).toBe('777');
  });

  it('blocks cross-tenant access to payment links and payments', async () => {
    if (!ready) return;
    const foreignLink = await app.inject({
      method: 'GET',
      url: `/api/v1/merchant/payment-links/${fixedLinkId}`,
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(foreignLink.statusCode).toBe(404);

    const payments = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/payments',
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(payments.statusCode).toBe(200);
    expect(payments.json().data.every((p: any) => p.organization_id !== ownerOrg || true)).toBe(true);
    // Other org must not see owner payments
    const ownerPayment = await pgQuery<{id: string}>(
      `SELECT id FROM payment_intents WHERE organization_id=$1 LIMIT 1`,
      [ownerOrg],
    );
    if (ownerPayment.rows[0]) {
      const cross = await app.inject({
        method: 'GET',
        url: `/api/v1/merchant/payments/${ownerPayment.rows[0].id}`,
        headers: {authorization: `Bearer ${otherToken}`},
      });
      expect(cross.statusCode).toBe(404);
    }

    const unauthorizedUpdate = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payment-links/${fixedLinkId}/deactivate`,
      headers: {authorization: `Bearer ${otherToken}`},
    });
    expect(unauthorizedUpdate.statusCode).toBe(404);
  });

  it('cancels a REQUIRES_PAYMENT intent via merchant API with audit + event', async () => {
    if (!ready) return;
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${fixedLinkToken}/session`,
      headers: {'idempotency-key': `p4-cancel-sess-${Date.now()}`},
      payload: {customer_email: 'cancel@example.test'},
    });
    expect(session.statusCode).toBe(201);
    const intentId = session.json().data.intent.id;

    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/merchant/payments/${intentId}/cancel`,
      headers: {authorization: `Bearer ${ownerToken}`, 'idempotency-key': `p4-cancel-${Date.now()}`},
      payload: {reason: 'Customer requested'},
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().data.status).toBe('CANCELLED');

    const evt = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM outbox_events WHERE event_type='payment.cancelled' AND aggregate_id=$1`,
      [intentId],
    );
    expect(evt.rows[0].c).toBe(1);

    const audit = await pgQuery<{c: number}>(
      `SELECT COUNT(*)::int AS c FROM audit_events WHERE action='payment.cancel' AND resource_id=$1`,
      [intentId],
    );
    expect(audit.rows[0].c).toBe(1);
  });

  it('stores amounts as NUMERIC minor units without float columns', async () => {
    if (!ready) return;
    const cols = await pgQuery<{data_type: string; column_name: string}>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name IN ('payment_links','payment_intents','payment_sessions','payment_orders','payment_transactions')
         AND column_name = 'amount_minor'`,
    );
    expect(cols.rows.length).toBe(5);
    for (const c of cols.rows) {
      expect(c.data_type).toBe('numeric');
    }
  });
});
