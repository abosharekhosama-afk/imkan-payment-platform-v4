/**
 * Rate-limit storage abstraction (P15.2).
 * - InMemory: single-process / local / test default
 * - Redis: required for production multi-instance
 * See docs/security/RATE_LIMITING_POLICY.md
 */

export type RateLimitCounterResult = {allowed: boolean; remaining: number; resetAt: number};

export interface RateLimitStore {
  bump(key: string, limit: number, windowSeconds: number): Promise<RateLimitCounterResult> | RateLimitCounterResult;
  reset?(): void | Promise<void>;
  ping?(): Promise<boolean>;
}

type Counter = {count: number; resetAt: number};

export class InMemoryRateLimitStore implements RateLimitStore {
  private counters = new Map<string, Counter>();

  bump(key: string, limit: number, windowSeconds: number): RateLimitCounterResult {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowSeconds * 1000;
      this.counters.set(key, {count: 1, resetAt});
      return {allowed: true, remaining: limit - 1, resetAt};
    }
    existing.count += 1;
    if (existing.count > limit) {
      return {allowed: false, remaining: 0, resetAt: existing.resetAt};
    }
    return {allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt};
  }

  reset() {
    this.counters.clear();
  }

  async ping() {
    return true;
  }
}

/** Minimal Redis surface used by RedisRateLimitStore (node-redis compatible). */
export type RedisRateLimitClient = {
  incr(key: string): Promise<number> | number;
  pExpire(key: string, ms: number): Promise<unknown>;
  pTTL(key: string): Promise<number> | number;
  ping(): Promise<string | boolean> | string | boolean;
  del?(key: string): Promise<unknown>;
};

/**
 * Fixed-window Redis rate limiter (INCR + PEXPIRE).
 * Shared Redis => multi-instance safe.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: RedisRateLimitClient,
    private readonly keyPrefix = 'rl:',
  ) {}

  private fullKey(key: string) {
    return `${this.keyPrefix}${key}`;
  }

  async bump(key: string, limit: number, windowSeconds: number): Promise<RateLimitCounterResult> {
    const redisKey = this.fullKey(key);
    const count = Number(await this.client.incr(redisKey));
    if (count === 1) {
      await this.client.pExpire(redisKey, windowSeconds * 1000);
    }
    let ttlMs = Number(await this.client.pTTL(redisKey));
    if (ttlMs < 0) {
      await this.client.pExpire(redisKey, windowSeconds * 1000);
      ttlMs = windowSeconds * 1000;
    }
    const resetAt = Date.now() + ttlMs;
    if (count > limit) {
      return {allowed: false, remaining: 0, resetAt};
    }
    return {allowed: true, remaining: Math.max(0, limit - count), resetAt};
  }

  async reset() {
    // Intentionally no FLUSH — tests delete keys via deleteKey / dedicated prefix.
  }

  async ping() {
    const res = await this.client.ping();
    return res === 'PONG' || res === 'ok' || res === true;
  }

  async deleteKey(key: string) {
    if (typeof this.client.del === 'function') {
      await this.client.del(this.fullKey(key));
    }
  }
}

let activeStore: RateLimitStore = new InMemoryRateLimitStore();

export function getRateLimitStore(): RateLimitStore {
  return activeStore;
}

export function setRateLimitStore(store: RateLimitStore) {
  activeStore = store;
}

export function resetRateLimitStore() {
  const result = activeStore.reset?.();
  if (result && typeof (result as Promise<void>).then === 'function') {
    void (result as Promise<void>);
  }
  if (!(activeStore instanceof InMemoryRateLimitStore)) {
    return;
  }
  activeStore = new InMemoryRateLimitStore();
}

export function forceInMemoryRateLimitStore() {
  activeStore = new InMemoryRateLimitStore();
  return activeStore as InMemoryRateLimitStore;
}
