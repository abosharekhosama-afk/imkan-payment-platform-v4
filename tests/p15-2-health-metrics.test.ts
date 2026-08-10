import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPing} from '../apps/api/src/infrastructure/db/postgres.js';
import {incrMetric, resetMetrics, snapshotMetrics} from '../apps/api/src/observability/metrics.js';
import {evaluateAlerts} from '../apps/api/src/observability/alerts.js';
import {sanitizeLogFields} from '../apps/api/src/observability/logging.js';

const hasPg = async () => {
  try {
    return await pgPing();
  } catch {
    return false;
  }
};

describe('P15.2 health / readiness / metrics', () => {
  const app = Fastify({logger: false});
  let ready = false;

  beforeAll(async () => {
    ready = await hasPg();
    if (!ready) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') throw new Error('PostgreSQL required');
      return;
    }
    resetMetrics();
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok with request correlation', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'GET', url: '/api/v1/health'});
    expect(res.statusCode).toBe(200);
    expect(res.json().data.status).toBe('ok');
    expect(res.json().data.api).toBe('v1');
  });

  it('GET /health/ready includes postgres and rate_limit checks', async () => {
    if (!ready) return;
    const res = await app.inject({method: 'GET', url: '/api/v1/health/ready'});
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.status).toBe('ready');
    expect(data.postgres).toBe(true);
    expect(data.rate_limit).toBeTruthy();
    expect(data.secret_backend).toBeTruthy();
  });

  it('GET /metrics returns counters and alert evaluations', async () => {
    if (!ready) return;
    incrMetric('webhook_failures_total', undefined, 6);
    const res = await app.inject({method: 'GET', url: '/api/v1/metrics'});
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.counters).toBeTruthy();
    expect(data.alerts.some((a: any) => a.id === 'webhook_failures' && a.firing)).toBe(true);
  });

  it('metrics prometheus text format works', async () => {
    if (!ready) return;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/metrics?format=prometheus',
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('imkan');
  });

  it('sanitizeLogFields redacts secrets', () => {
    const out = sanitizeLogFields({password: 'x', token: 'y', ok: 1, nested: {api_key: 'z'}});
    expect(out.password).toBe('[REDACTED]');
    expect(out.token).toBe('[REDACTED]');
    expect(out.ok).toBe(1);
    expect((out.nested as any).api_key).toBe('[REDACTED]');
  });

  it('evaluateAlerts reports non-firing when under threshold', () => {
    resetMetrics();
    const alerts = evaluateAlerts();
    expect(alerts.every((a) => !a.firing)).toBe(true);
    expect(Object.keys(snapshotMetrics()).length).toBe(0);
  });
});
