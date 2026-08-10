import {describe, expect, it, beforeEach} from 'vitest';
import {FakeRedisClient} from '../apps/api/src/foundation/fake-redis.js';
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  forceInMemoryRateLimitStore,
  setRateLimitStore,
} from '../apps/api/src/foundation/rate-limit-store.js';
import {resolveRateLimitBackend} from '../apps/api/src/foundation/rate-limit-bootstrap.js';

describe('P15.2 Redis / distributed rate limiting', () => {
  beforeEach(() => {
    forceInMemoryRateLimitStore();
  });

  it('RedisRateLimitStore enforces fixed-window limits', async () => {
    const redis = new FakeRedisClient();
    const store = new RedisRateLimitStore(redis, 'test:');
    const key = 'ip:api_keys.manage:1.2.3.4';
    const a = await store.bump(key, 3, 60);
    const b = await store.bump(key, 3, 60);
    const c = await store.bump(key, 3, 60);
    const d = await store.bump(key, 3, 60);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.remaining).toBe(0);
    expect(await store.ping()).toBe(true);
  });

  it('two store instances sharing Redis share counters (multi-instance)', async () => {
    const redis = new FakeRedisClient();
    const instanceA = new RedisRateLimitStore(redis, 'mi:');
    const instanceB = new RedisRateLimitStore(redis, 'mi:');
    const key = 'ip:auth.login:9.9.9.9';
    expect((await instanceA.bump(key, 2, 60)).allowed).toBe(true);
    expect((await instanceB.bump(key, 2, 60)).allowed).toBe(true);
    // Third bump from either instance must deny
    expect((await instanceA.bump(key, 2, 60)).allowed).toBe(false);
    expect((await instanceB.bump(key, 2, 60)).allowed).toBe(false);
  });

  it('in-memory store does NOT share across instances (documents production gap closed by Redis)', async () => {
    const a = new InMemoryRateLimitStore();
    const b = new InMemoryRateLimitStore();
    const key = 'ip:auth.login:local';
    expect(a.bump(key, 1, 60).allowed).toBe(true);
    // Separate memory maps — second instance still allows (unsafe for multi-instance)
    expect(b.bump(key, 1, 60).allowed).toBe(true);
  });

  it('resolveRateLimitBackend defaults to memory outside production', () => {
    const prev = process.env.RATE_LIMIT_STORE;
    delete process.env.RATE_LIMIT_STORE;
    expect(resolveRateLimitBackend()).toBe('memory');
    process.env.RATE_LIMIT_STORE = 'redis';
    expect(resolveRateLimitBackend()).toBe('redis');
    if (prev === undefined) delete process.env.RATE_LIMIT_STORE;
    else process.env.RATE_LIMIT_STORE = prev;
  });

  it('setRateLimitStore wires Redis into active store', async () => {
    const redis = new FakeRedisClient();
    const store = new RedisRateLimitStore(redis, 'wire:');
    setRateLimitStore(store);
    const {getRateLimitStore} = await import('../apps/api/src/foundation/rate-limit-store.js');
    const active = getRateLimitStore();
    const r = await active.bump('k', 1, 30);
    expect(r.allowed).toBe(true);
    const denied = await active.bump('k', 1, 30);
    expect(denied.allowed).toBe(false);
  });
});
