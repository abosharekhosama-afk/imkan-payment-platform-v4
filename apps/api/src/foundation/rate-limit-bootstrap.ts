/**
 * Bootstrap distributed rate-limit store (P15.2).
 * Production: Redis required (no in-memory fallback).
 * Non-production: in-memory unless RATE_LIMIT_STORE=redis + REDIS_URL.
 */
import {config} from '../config.js';
import {getRedis} from '../infrastructure/db/redis.js';
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  setRateLimitStore,
  type RateLimitStore,
} from './rate-limit-store.js';

export type RateLimitBackend = 'memory' | 'redis';

export function resolveRateLimitBackend(): RateLimitBackend {
  const explicit = (process.env.RATE_LIMIT_STORE || '').toLowerCase().trim();
  if (explicit === 'redis') return 'redis';
  if (explicit === 'memory' || explicit === 'inmemory' || explicit === 'in-memory') {
    if (config.isProduction) {
      throw new Error(
        'RATE_LIMIT_STORE=memory is forbidden in production. Use RATE_LIMIT_STORE=redis with REDIS_URL.',
      );
    }
    return 'memory';
  }
  // Production default: redis. Non-production default: memory.
  if (config.isProduction) return 'redis';
  return 'memory';
}

export async function bootstrapRateLimitStore(): Promise<{backend: RateLimitBackend; store: RateLimitStore}> {
  const backend = resolveRateLimitBackend();
  if (backend === 'memory') {
    const store = new InMemoryRateLimitStore();
    setRateLimitStore(store);
    return {backend, store};
  }

  if (!process.env.REDIS_URL) {
    throw new Error('RATE_LIMIT_STORE=redis requires REDIS_URL');
  }

  const client = await getRedis();
  const store = new RedisRateLimitStore(client, process.env.RATE_LIMIT_REDIS_PREFIX || 'rl:');
  setRateLimitStore(store);
  return {backend, store};
}

export async function rateLimitStoreReady(): Promise<{required: boolean; ready: boolean; backend: RateLimitBackend}> {
  const backend = resolveRateLimitBackend();
  if (backend === 'memory') {
    return {required: false, ready: true, backend};
  }
  try {
    const {getRateLimitStore} = await import('./rate-limit-store.js');
    const store = getRateLimitStore();
    if (store.ping) {
      const ok = await store.ping();
      return {required: true, ready: ok, backend};
    }
    // Store not bootstrapped yet — try Redis ping directly
    const {redisPing} = await import('../infrastructure/db/redis.js');
    const status = await redisPing();
    return {required: true, ready: status === 'ok', backend};
  } catch {
    return {required: true, ready: false, backend};
  }
}
