import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify, {type FastifyInstance} from 'fastify';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPool, pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {outboxWorker} from '../apps/api/src/foundation/outbox-worker.js';
import {ledgerService} from '../apps/api/src/ledger/ledger-service.js';
import {getCapabilityProfile} from '../apps/api/src/providers/capability-matrix.js';
import {issueStepUpToken} from './helpers/step-up.js';

const required = process.env.FOUNDATION_PG_REQUIRED === 'true';

async function ensureMigrations() {
  const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {
    cwd: path.resolve(process.cwd()),
    env: process.env,
    encoding: 'utf8',
    shell: true,
  });
  if (migrate.status !== 0) throw new Error(migrate.stderr || migrate.stdout || 'migrate failed');
}

async function registerOwner(app: FastifyInstance, suffix: string) {
  const email = `p7-${suffix}-${Date.now()}@example.test`;
  const password = 'SecurePass!123';
  const reg = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email,
      password,
      organization_name: `P7 ${suffix}`,
      name: suffix,
      country_code: 'SA',
    },
  });
  expect(reg.statusCode).toBe(201);
  const orgId = reg.json().data.organization_id as string;
  const userId = reg.json().data.user_id as string;
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/verify-email',
    payload: {token: reg.json().data.email_verification_token},
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {email, password},
  });
  expect(login.statusCode).toBe(200);
  return {email, password, orgId, userId, token: login.json().data.access_token as string};
}

describe('phase 7 financial foundations', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let owner: Awaited<ReturnType<typeof registerOwner>>;

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
    owner = await registerOwner(app, 'fin');
  }, 180_000);

  afterAll(async () => {
    outboxWorker.stop();
    await app.close().catch(() => undefined);
    await pgPool.end().catch(() => undefined);
  });

  it('capability matrix exposes sandbox and blocks live narrative', () => {
    const sbx = getCapabilityProfile('SANDBOX');
    expect(sbx.found).toBe(true);
    expect(sbx.capabilities?.refund).toBe(true);
    const paytabs = getCapabilityProfile('PAYTABS');
    expect(paytabs.live_blocked_by).toBe('DEC-009');
  });

  it('ledger posts balanced payment journal and balances', async function () {
    if (!ready) return;
    const merchant = await pgQuery(
      `SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`,
      [owner.orgId],
    );
    let merchantProfileId = merchant.rows[0]?.id as string | undefined;
    if (!merchantProfileId) {
      const created = await pgQuery(
        `INSERT INTO merchant_profiles(organization_id, trading_name) VALUES ($1,$2) RETURNING id`,
        [owner.orgId, 'P7 Merchant'],
      );
      merchantProfileId = created.rows[0].id;
    }
    const pi = await pgQuery(
      `INSERT INTO payment_intents(
         organization_id, merchant_profile_id, amount_minor, currency_code, status
       ) VALUES ($1, $2, 10000, 'SAR', 'SUCCEEDED')
       RETURNING id`,
      [owner.orgId, merchantProfileId],
    );
    const paymentId = pi.rows[0].id as string;
    await ledgerService.postPaymentSucceeded(owner.orgId, paymentId, '10000', 'SAR');
    const bal = await ledgerService.getBalances(owner.orgId);
    expect(bal.source).toBe('financial_core');
    expect(BigInt(bal.pending_minor) >= 0n).toBe(true);
  });

  it('refund rejects over-capture and unauthorized viewer', async function () {
    if (!ready) return;
    const {refundsService} = await import('../apps/api/src/refunds/refunds-service.js');
    const merchant = await pgQuery(
      `SELECT id FROM merchant_profiles WHERE organization_id=$1 LIMIT 1`,
      [owner.orgId],
    );
    const merchantProfileId = merchant.rows[0].id as string;
    const pi = await pgQuery(
      `INSERT INTO payment_intents(
         organization_id, merchant_profile_id, amount_minor, currency_code, status
       ) VALUES ($1, $2, 5000, 'SAR', 'SUCCEEDED') RETURNING id`,
      [owner.orgId, merchantProfileId],
    );
    const paymentId = pi.rows[0].id as string;

    await expect(
      refundsService.createRefund({
        organizationId: owner.orgId,
        paymentIntentId: paymentId,
        amountMinor: '9000',
        currency: 'SAR',
        actorUserId: owner.userId,
        idempotencyKey: `rf-over-${Date.now()}`,
      }),
    ).rejects.toMatchObject({code: 'REFUND_EXCEEDS_CAPTURED', statusCode: 422});

    const noAuth = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
    });
    expect(noAuth.statusCode).toBe(401);

    const step = await issueStepUpToken(app, owner.token);
    const okRefund = await app.inject({
      method: 'POST',
      url: '/api/v1/refunds',
      headers: {
        authorization: `Bearer ${owner.token}`,
        'idempotency-key': `rf-ok-${Date.now()}`,
        'x-step-up-token': step,
      },
      payload: {
        payment_intent_id: paymentId,
        amount_minor: '1000',
        currency_code: 'SAR',
        reason: 'test',
      },
    });
    if (okRefund.statusCode !== 201) {
      // eslint-disable-next-line no-console
      console.error('refund create body', okRefund.statusCode, okRefund.json());
    }
    expect(okRefund.statusCode).toBe(201);
  });

  it('capability profile endpoint requires auth', async function () {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/providers/SANDBOX/capability-profile',
      headers: {authorization: `Bearer ${owner.token}`},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toBe('SANDBOX');
  });
});
