import {describe, expect, it} from 'vitest';
import {
  assessWebhookReadiness,
  canRunRealSandboxE2E,
  formatPreflightSummary,
  runPayTabsPreflight,
} from '../apps/api/src/providers/paytabs/preflight.js';

describe('P15.5 PayTabs preflight module', () => {
  it('assessWebhookReadiness rejects localhost callback', () => {
    const wh = assessWebhookReadiness({
      callbackUrl: 'http://localhost:3000/api/v1/webhooks/providers/paytabs',
    });
    expect(wh.callbackUrlConfigured).toBe(true);
    expect(wh.callbackUrlPublicHttps).toBe(false);
  });

  it('assessWebhookReadiness accepts public https callback', () => {
    const wh = assessWebhookReadiness({
      callbackUrl: 'https://api.example.test/api/v1/webhooks/providers/paytabs',
    });
    expect(wh.callbackUrlPublicHttps).toBe(true);
  });

  it('runPayTabsPreflight returns safe summary without secrets', async () => {
    process.env.PAYTABS_ENV = 'sandbox';
    process.env.PAYTABS_ADAPTER_MODE = 'http';
    const report = await runPayTabsPreflight();
    const summary = formatPreflightSummary(report);
    expect(summary).toContain('PayTabs Sandbox Preflight');
    expect(summary).not.toMatch(/SKJ[A-Z0-9-]+/);
    expect(report.env).toBe('sandbox');
  });

  it('canRunRealSandboxE2E false without credentials', () => {
    const wh = assessWebhookReadiness({callbackUrl: 'https://api.example.test/cb'});
    expect(
      canRunRealSandboxE2E(
        {
          configured: false,
          mode: 'http',
          env: 'sandbox',
          missing: ['PAYTABS_SANDBOX_SERVER_KEY'],
          blockedReason: 'blocked',
        },
        wh,
      ),
    ).toBe(false);
  });
});
