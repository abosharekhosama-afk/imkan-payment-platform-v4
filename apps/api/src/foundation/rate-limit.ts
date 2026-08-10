import type {FastifyRequest} from 'fastify';
import {AppError} from './errors.js';
import {pgQuery} from '../infrastructure/db/postgres.js';
import {getRateLimitStore, resetRateLimitStore} from './rate-limit-store.js';
import {incrMetric} from '../observability/metrics.js';

export type RateLimitBucket =
  | 'checkout.read'
  | 'checkout.session'
  | 'checkout.payment'
  | 'payment_links.write'
  | 'payments.read'
  | 'api_keys.manage'
  | 'webhooks.ingress'
  | 'providers.read'
  | 'auth.login'
  | 'auth.register'
  | 'auth.password_reset'
  | 'auth.email_verification'
  | 'auth.mfa'
  | 'users.invite';

export const RATE_LIMIT_PLAN: Record<
  RateLimitBucket,
  {perIp: number; perOrg?: number; perKey?: number; perUser?: number; windowSeconds: number}
> = {
  'checkout.read': {perIp: 120, windowSeconds: 60},
  'checkout.session': {perIp: 30, windowSeconds: 60},
  'checkout.payment': {perIp: 20, windowSeconds: 60},
  'payment_links.write': {perIp: 60, perOrg: 120, windowSeconds: 60},
  'payments.read': {perIp: 300, perOrg: 600, windowSeconds: 60},
  'api_keys.manage': {perIp: 20, perOrg: 40, windowSeconds: 60},
  'webhooks.ingress': {perIp: 120, windowSeconds: 60},
  'providers.read': {perIp: 120, perOrg: 300, windowSeconds: 60},
  'auth.login': {perIp: 20, windowSeconds: 60},
  'auth.register': {perIp: 10, windowSeconds: 60},
  'auth.password_reset': {perIp: 10, windowSeconds: 60},
  'auth.email_verification': {perIp: 20, windowSeconds: 60},
  'auth.mfa': {perIp: 30, perUser: 20, windowSeconds: 60},
  'users.invite': {perIp: 30, perOrg: 60, windowSeconds: 60},
};

/** Non-production suites share one process Map — raise auth limits so regression tests do not trip RL. */
function applyNonProductionAuthHeadroom() {
  if (process.env.NODE_ENV === 'production') return;
  for (const key of [
    'auth.login',
    'auth.register',
    'auth.password_reset',
    'auth.email_verification',
    'auth.mfa',
    'users.invite',
  ] as RateLimitBucket[]) {
    const plan = RATE_LIMIT_PLAN[key];
    plan.perIp = Math.max(plan.perIp, 5_000);
    if (plan.perOrg) plan.perOrg = Math.max(plan.perOrg, 5_000);
    if (plan.perUser) plan.perUser = Math.max(plan.perUser, 5_000);
  }
}
applyNonProductionAuthHeadroom();

async function auditHit(input: {
  organizationId?: string | null;
  apiKeyId?: string | null;
  bucket: string;
  subjectKey: string;
  limitValue: number;
  windowSeconds: number;
  ip?: string;
  route?: string;
}) {
  try {
    await pgQuery(
      `INSERT INTO rate_limit_events (organization_id, api_key_id, bucket, subject_key, limit_value, window_seconds, ip, route)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.organizationId || null,
        input.apiKeyId || null,
        input.bucket,
        input.subjectKey,
        input.limitValue,
        input.windowSeconds,
        input.ip || null,
        input.route || null,
      ],
    );
  } catch {
    // Observability must not break request path
  }
}

/**
 * Fixed-window limiter. Storage is abstracted (default: in-memory).
 * Multi-instance production requires Redis — see RATE_LIMITING_POLICY.md (BLOCKED until wired).
 */
export function rateLimit(bucket: RateLimitBucket) {
  const plan = RATE_LIMIT_PLAN[bucket];
  return async (request: FastifyRequest) => {
    const windowSeconds = plan.windowSeconds;
    const ip = request.ip || 'unknown';
    const orgId = request.auth?.organizationId || null;
    const userId = request.auth?.userId || null;
    const apiKeyId = (request.auth as any)?.apiKeyId as string | undefined;
    const route = request.routeOptions?.url || request.url;
    const store = getRateLimitStore();

    const checks: Array<{key: string; limit: number}> = [{key: `ip:${bucket}:${ip}`, limit: plan.perIp}];
    if (plan.perOrg && orgId) checks.push({key: `org:${bucket}:${orgId}`, limit: plan.perOrg});
    if (plan.perKey && apiKeyId) checks.push({key: `key:${bucket}:${apiKeyId}`, limit: plan.perKey});
    if (plan.perUser && userId) checks.push({key: `user:${bucket}:${userId}`, limit: plan.perUser});

    for (const c of checks) {
      const result = await store.bump(c.key, c.limit, windowSeconds);
      if (!result.allowed) {
        await auditHit({
          organizationId: orgId,
          apiKeyId: apiKeyId || null,
          bucket,
          subjectKey: c.key,
          limitValue: c.limit,
          windowSeconds,
          ip,
          route,
        });
        incrMetric('rate_limit_hits_total', {bucket});
        throw new AppError('RATE_LIMITED', `Rate limit exceeded for ${bucket}`, 429, {
          bucket,
          reset_at: new Date(result.resetAt).toISOString(),
        });
      }
    }
  };
}

/** @deprecated Use rateLimit — kept as alias for Phase 4 route imports. */
export const rateLimitPrep = rateLimit;

/** Test helper */
export function resetRateLimitCounters() {
  resetRateLimitStore();
}
