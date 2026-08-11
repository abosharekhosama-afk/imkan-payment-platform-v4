import {afterEach, describe, expect, it} from 'vitest';
import {
  allowSandboxPaymentTokens,
  getPlatformRuntimeConfig,
  isSandboxPaymentToken,
} from '../apps/api/src/platform/runtime-config.js';
import {assertProductionPaymentMethodAllowed} from '../apps/api/src/platform/sandbox-token-guard.js';
import {AppError} from '../apps/api/src/foundation/errors.js';

describe('P16 platform runtime', () => {
  const env = {...process.env};

  afterEach(() => {
    process.env = {...env};
  });

  it('detects sandbox payment tokens', () => {
    expect(isSandboxPaymentToken('tok_ok')).toBe(true);
    expect(isSandboxPaymentToken('pm_live_abc')).toBe(false);
  });

  it('allows sandbox tokens in development', () => {
    process.env.NODE_ENV = 'development';
    expect(allowSandboxPaymentTokens()).toBe(true);
    assertProductionPaymentMethodAllowed('tok_ok');
  });

  it('blocks sandbox tokens in production unless explicitly allowed for staging', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_PROVIDER = 'none';
    process.env.ALLOW_SANDBOX_TOKENS_IN_PRODUCTION = 'false';
    expect(allowSandboxPaymentTokens()).toBe(false);
    try {
      assertProductionPaymentMethodAllowed('tok_ok');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('SANDBOX_TOKEN_FORBIDDEN');
    }
  });

  it('runtime config excludes paytabs from P16 scope marker', () => {
    process.env.NODE_ENV = 'development';
    const cfg = getPlatformRuntimeConfig();
    expect(cfg.excluded_from_p16).toContain('paytabs_live');
    expect(cfg.production_gate_passed).toBe(false);
  });
});
