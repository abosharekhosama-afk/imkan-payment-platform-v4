/**
 * Stripe preflight — never prints secrets.
 */
import {
  isRealStripeCredentialSet,
  isStripeLiveAllowed,
  resolveStripeRequestedPlane,
} from './config.js';
import {loadStripeCredentials, resolveStripeMode} from './credentials.js';

export type StripePreflightReport = {
  timestamp: string;
  plane: 'test' | 'live';
  adapterMode: 'simulate' | 'http';
  liveAllowed: boolean;
  credentials: {configured: boolean; missing: string[]};
  httpReady: boolean;
  liveReady: boolean;
  blockers: string[];
};

export async function runStripePreflight(): Promise<StripePreflightReport> {
  const plane = resolveStripeRequestedPlane();
  const mode = resolveStripeMode();
  const liveAllowed = isStripeLiveAllowed();
  const blockers: string[] = [];
  const missing: string[] = [];

  if (plane === 'live' && !liveAllowed) {
    blockers.push('STRIPE_ALLOW_LIVE must be true for live plane');
  }

  const creds = await loadStripeCredentials(plane);
  if (!creds || !isRealStripeCredentialSet(creds.secretKey, creds.webhookSecret)) {
    if (plane === 'live') {
      missing.push('STRIPE_LIVE_SECRET_KEY', 'STRIPE_LIVE_WEBHOOK_SECRET');
    } else {
      missing.push('STRIPE_TEST_SECRET_KEY (or STRIPE_SECRET_KEY)', 'STRIPE_TEST_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SECRET)');
    }
    blockers.push('Stripe credentials missing or placeholders');
  }

  if (mode === 'simulate' && process.env.STRIPE_ADAPTER_MODE !== 'simulate') {
    // informational — simulate is fine for CI
  }

  const configured = missing.length === 0;
  const httpReady = configured && mode === 'http';
  const liveReady = plane === 'live' && liveAllowed && httpReady && Boolean(creds?.isLiveKey);

  return {
    timestamp: new Date().toISOString(),
    plane,
    adapterMode: mode,
    liveAllowed,
    credentials: {configured, missing},
    httpReady,
    liveReady,
    blockers,
  };
}

export function formatStripePreflightSummary(report: StripePreflightReport): string {
  const lines = [
    `Stripe Preflight (${report.timestamp})`,
    `  plane=${report.plane} adapterMode=${report.adapterMode} liveAllowed=${report.liveAllowed}`,
    `  credentials.configured=${report.credentials.configured} missing=[${report.credentials.missing.join(', ')}]`,
    `  httpReady=${report.httpReady} liveReady=${report.liveReady}`,
  ];
  if (report.blockers.length) {
    lines.push('  blockers:');
    for (const b of report.blockers) lines.push(`    - ${b}`);
  }
  return lines.join('\n');
}
