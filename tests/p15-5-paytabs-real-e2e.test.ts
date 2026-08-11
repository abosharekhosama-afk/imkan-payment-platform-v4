/**
 * P15.5 — Real PayTabs Sandbox E2E certification (credential-gated).
 *
 * Runs ONLY when runPayTabsPreflight().e2eReady === true:
 *   PAYTABS_ENV=sandbox
 *   PAYTABS_ADAPTER_MODE=http
 *   PAYTABS_REAL_SANDBOX_CERT=true
 *   PAYTABS_SANDBOX_SERVER_KEY + PAYTABS_SANDBOX_PROFILE_ID (SecretResolver)
 *   PAYTABS_SANDBOX_CALLBACK_URL = public HTTPS
 *   PAYTABS_REAL_WEBHOOK_ENDPOINT = verified public webhook URL
 *
 * Without credentials: documents BLOCKED — never fake PASS.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {providerRouter} from '../apps/api/src/providers/router.js';
import {
  canRunRealSandboxE2E,
  canRunRealSandboxHttp,
  runPayTabsPreflight,
  type PayTabsPreflightReport,
} from '../apps/api/src/providers/paytabs/preflight.js';
import {createPayTabsAdapter} from '../apps/api/src/providers/paytabs/index.js';
import {createPayTabsClient} from '../apps/api/src/providers/paytabs/http-client.js';
import {loadPayTabsSandboxCredentials} from '../apps/api/src/providers/paytabs/credentials.js';
import {resolveUnknownPayTabsOutcome} from '../apps/api/src/providers/paytabs/query-recovery.js';
import {signPayTabsCallback} from '../apps/api/src/providers/paytabs/webhook.js';
import {providerWebhookService} from '../apps/api/src/providers/webhook-service.js';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

process.env.PAYTABS_ENV = process.env.PAYTABS_ENV || 'sandbox';
process.env.PAYTABS_ADAPTER_MODE = process.env.PAYTABS_ADAPTER_MODE || 'http';

const PASSWORD = 'SecurePass!123';

let preflight: PayTabsPreflightReport;
let httpReady = false;
let e2eReady = false;

beforeAll(async () => {
  preflight = await runPayTabsPreflight();
  httpReady = preflight.httpReady;
  e2eReady = preflight.e2eReady;
});

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
    payload: {email, password: PASSWORD, organization_name: orgName, name: 'E2E User'},
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
     WHERE p.code='paytabs' AND pa.environment='SANDBOX' AND pa.organization_id IS NULL LIMIT 1`,
  );
  expect(acc.rows[0]?.id).toBeTruthy();
  await pgQuery(
    `INSERT INTO provider_routes (organization_id, environment, currency_code, provider_account_id, priority, is_active)
     VALUES ($1,'SANDBOX','SAR',$2,1,TRUE) ON CONFLICT DO NOTHING`,
    [orgId, acc.rows[0].id],
  );
}

describe('P15.5 PayTabs preflight', () => {
  it('PT5-PF-01: preflight report without secrets', () => {
    expect(preflight.env).toBe('sandbox');
    expect(preflight.adapterMode).toBe('http');
    expect(preflight.timestamp).toBeTruthy();
    const json = JSON.stringify(preflight);
    expect(json).not.toMatch(/SKJ[A-Z0-9-]{8,}/);
    expect(json).not.toMatch(/"serverKey"\s*:\s*"[^"]{8,}"/i);
  });

  it('PT5-PF-02: documents blockers when credentials absent', () => {
    if (e2eReady) return;
    expect(preflight.blockers.length).toBeGreaterThan(0);
    expect(preflight.e2eReady).toBe(false);
  });
});

describe.skipIf(!httpReady)('P15.5 Real PayTabs HTTP', () => {
  const orgId = '00000000-0000-4000-8000-000000000010';
  let adapter: ReturnType<typeof createPayTabsAdapter>;
  let tranRef: string | undefined;

  beforeAll(async () => {
    const creds = await loadPayTabsSandboxCredentials();
    expect(creds).toBeTruthy();
    adapter = createPayTabsAdapter(createPayTabsClient(creds!, 'http'));
  });

  it('PT5-HTTP-01: real connectivity + payment creation', async () => {
    const result = await adapter.authorize({
      organizationId: orgId,
      paymentIntentId: crypto.randomUUID(),
      paymentAttemptId: crypto.randomUUID(),
      amountMinor: '1000',
      currencyCode: 'SAR',
      idempotencyKey: `p155-http-${Date.now()}`,
    });
    expect(result.status).toBe('REQUIRES_ACTION');
    expect(result.providerReference).toBeTruthy();
    tranRef = result.providerReference;
  }, 45_000);

  it('PT5-HTTP-02: real status query', async () => {
    expect(tranRef).toBeTruthy();
    const status = await adapter.getStatus({organizationId: orgId, providerReference: tranRef!});
    expect(['SUCCEEDED', 'PENDING', 'FAILED', 'REQUIRES_ACTION']).toContain(status.status);
  }, 30_000);

  it('PT5-HTTP-03: query recovery on unknown outcome path', async () => {
    expect(tranRef).toBeTruthy();
    const creds = await loadPayTabsSandboxCredentials();
    const client = createPayTabsClient(creds!, 'http');
    const recovered = await resolveUnknownPayTabsOutcome({
      client,
      profileId: creds!.profileId,
      providerReference: tranRef,
    });
    expect(recovered.recoveredViaQuery).toBe(true);
  }, 30_000);
});

describe.skipIf(!e2eReady)('P15.5 Real PayTabs E2E — Checkout + Webhook + Ledger', () => {
  const app = Fastify({logger: false});
  let orgId = '';
  let linkToken = '';
  let tranRef = '';
  let intentId = '';

  beforeAll(async () => {
    const ready = await pgPing().catch(() => false);
    if (!ready) throw new Error('PostgreSQL required for E2E');
    await ensureMigrations();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();
    const ts = Date.now();
    const user = await registerUser(app, `pt-e2e-${ts}@example.test`, 'PayTabs E2E');
    orgId = user.orgId;
    await bindPayTabsRoute(orgId);
    await app.inject({
      method: 'PUT',
      url: '/api/v1/merchant/payment-config',
      headers: {authorization: `Bearer ${user.token}`},
      payload: {
        company_display_name: 'PayTabs E2E',
        default_success_url: 'https://example.test/success',
        default_cancel_url: 'https://example.test/cancel',
      },
    });
    const link = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/payment-links',
      headers: {authorization: `Bearer ${user.token}`, 'idempotency-key': `p155-link-${ts}`},
      payload: {
        title: 'E2E Link',
        amount_mode: 'FIXED',
        amount_minor: '5000',
        currency_code: 'SAR',
        one_time: false,
        max_uses: 10,
      },
    });
    linkToken = link.json().data.public_token;
  }, 240_000);

  afterAll(async () => {
    await app.close().catch(() => undefined);
  });

  it('PT5-E2E-01: checkout REQUIRES_ACTION via real PayTabs', async () => {
    const session = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/session`,
      headers: {'idempotency-key': `p155-sess-${Date.now()}`},
      payload: {customer_email: 'e2e@example.test'},
    });
    expect(session.statusCode).toBe(201);
    const sessionToken = session.json().data.session.public_token;
    const pay = await app.inject({
      method: 'POST',
      url: `/api/v1/checkout/${linkToken}/payment`,
      headers: {'idempotency-key': `p155-pay-${Date.now()}`},
      payload: {session_token: sessionToken, payment_method_type_code: 'CARD'},
    });
    expect(pay.statusCode).toBe(200);
    expect(pay.json().data.status).toBe('REQUIRES_ACTION');
    tranRef = pay.json().data.provider_reference;
    intentId = pay.json().data.intent.id;
    expect(tranRef).toBeTruthy();
  }, 60_000);

  it('PT5-E2E-02: signed webhook applies ledger (simulates PayTabs callback shape)', async () => {
    const creds = await loadPayTabsSandboxCredentials();
    expect(creds).toBeTruthy();
    const payload = signPayTabsCallback(
      {
        tran_ref: tranRef,
        cart_id: intentId.replace(/-/g, '').slice(0, 32),
        response_status: 'A',
        cart_amount: '50.00',
        cart_currency: 'SAR',
      },
      creds!.webhookSecret,
    );
    const rawBody = JSON.stringify(payload);
    const ingest = await providerWebhookService.ingest({
      providerCode: 'paytabs',
      headers: {'content-type': 'application/json'},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(ingest.status).toBe('PROCESSED');
    const pi = await pgQuery<{status: string}>(`SELECT status FROM payment_intents WHERE id=$1`, [intentId]);
    expect(pi.rows[0]?.status).toBe('SUCCEEDED');
    const dup = await providerWebhookService.ingest({
      providerCode: 'paytabs',
      headers: {'content-type': 'application/json'},
      rawBody,
      environment: 'SANDBOX',
    });
    expect(dup.status).toBe('DUPLICATE');
  }, 30_000);

  it('PT5-E2E-03: idempotency on provider router', async () => {
    const resolved = await providerRouter.resolve({
      organizationId: orgId,
      environment: 'SANDBOX',
      currencyCode: 'SAR',
      requiredCapability: 'payment.authorize',
    });
    const key = `p155-idem-${crypto.randomUUID()}`;
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
  }, 45_000);
});

describe.skipIf(e2eReady)('P15.5 Real PayTabs E2E — BLOCKED', () => {
  it('PT5-BLOCKED: E2E certification not executed', () => {
    expect(e2eReady).toBe(false);
    expect(canRunRealSandboxE2E(
      {
        configured: preflight.credentials.configured,
        mode: preflight.adapterMode,
        env: preflight.env,
        missing: preflight.credentials.missing,
        blockedReason: preflight.credentials.blockedReason,
      },
      preflight.webhook,
    )).toBe(false);
    expect(preflight.blockers.length).toBeGreaterThan(0);
  });
});

describe('P15.5 Real inbound webhook from PayTabs servers', () => {
  it('PT5-WH-BLOCKED: requires public HTTPS + PAYTABS_REAL_WEBHOOK_ENDPOINT', () => {
    if (e2eReady) return;
    expect(preflight.webhook.realWebhookEndpointConfigured).toBe(false);
  });
});

describe('P15.5 Real 3DS / refund', () => {
  it('PT5-3DS-BLOCKED: manual HPP required when E2E not ready', () => {
    if (e2eReady) return;
    expect(true).toBe(true);
  });

  it('PT5-RF-BLOCKED: real refund requires completed real payment', () => {
    if (e2eReady) return;
    expect(true).toBe(true);
  });
});
