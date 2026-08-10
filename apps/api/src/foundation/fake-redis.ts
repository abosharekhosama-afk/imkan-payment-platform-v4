/**
 * In-process Redis stand-in for multi-instance rate-limit tests (no Docker required).
 * Two RedisRateLimitStore instances sharing one FakeRedis prove cross-instance semantics.
 */
export class FakeRedisClient {
  private data = new Map<string, {count: number; expireAt: number}>();

  async incr(key: string): Promise<number> {
    const now = Date.now();
    const existing = this.data.get(key);
    if (!existing || existing.expireAt <= now) {
      this.data.set(key, {count: 1, expireAt: Number.POSITIVE_INFINITY});
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  async pExpire(key: string, ms: number): Promise<number> {
    const existing = this.data.get(key);
    if (!existing) return 0;
    existing.expireAt = Date.now() + ms;
    return 1;
  }

  async pTTL(key: string): Promise<number> {
    const existing = this.data.get(key);
    if (!existing) return -2;
    if (!Number.isFinite(existing.expireAt)) return -1;
    const ttl = existing.expireAt - Date.now();
    return ttl < 0 ? -2 : ttl;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }
}
