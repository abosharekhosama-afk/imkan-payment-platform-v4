import {describe, expect, it, vi, beforeEach} from 'vitest';
import {apiV1, checkoutWebUrl} from './client';

describe('V4 api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects Legacy /v1 paths', async () => {
    await expect(apiV1('/v1/payments')).rejects.toThrow(/LEGACY_API_FORBIDDEN/);
    await expect(apiV1('/v1/auth/login')).rejects.toThrow(/LEGACY_API_FORBIDDEN/);
  });

  it('rejects legacy checkout paths', async () => {
    await expect(apiV1('/checkout/public/abc')).rejects.toThrow(/LEGACY_CHECKOUT_FORBIDDEN/);
    await expect(apiV1('/pay/abc')).rejects.toThrow(/LEGACY_CHECKOUT_FORBIDDEN/);
  });

  it('calls /api/v1 paths', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({data: {ok: true}}),
    } as Response);
    const data = await apiV1<{ok: boolean}>('/auth/me', {token: 'sess'});
    expect(data.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/auth/me');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sess',
    });
  });

  it('builds web checkout URL', () => {
    expect(checkoutWebUrl('tok123').endsWith('/checkout/tok123')).toBe(true);
  });
});
