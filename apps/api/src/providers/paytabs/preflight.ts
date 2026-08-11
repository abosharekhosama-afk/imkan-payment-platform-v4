/**
 * P15.5 PayTabs Sandbox preflight — no secrets in output.
 */
import {
  assessPayTabsCredentialStatus,
  canRunRealSandboxHttp,
  isRealSandboxCertRequested,
  resolvePayTabsEnv,
  type PayTabsCredentialStatus,
} from './config.js';
import {loadPayTabsSandboxCredentials, resolvePayTabsMode} from './credentials.js';

export type PayTabsPreflightReport = {
  timestamp: string;
  env: ReturnType<typeof resolvePayTabsEnv>;
  adapterMode: 'simulate' | 'http';
  certRequested: boolean;
  credentials: {
    configured: boolean;
    missing: string[];
    blockedReason?: string;
  };
  webhook: {
    callbackUrlConfigured: boolean;
    callbackUrlPublicHttps: boolean;
    realWebhookEndpointConfigured: boolean;
  };
  httpReady: boolean;
  e2eReady: boolean;
  blockers: string[];
};

function isPublicHttpsUrl(url: string | undefined | null): boolean {
  const u = String(url || '').trim();
  if (!u.startsWith('https://')) return false;
  try {
    const parsed = new URL(u);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

export function assessWebhookReadiness(creds: {callbackUrl?: string} | null): PayTabsPreflightReport['webhook'] {
  const callback = creds?.callbackUrl || process.env.PAYTABS_SANDBOX_CALLBACK_URL || '';
  return {
    callbackUrlConfigured: callback.trim().length > 0,
    callbackUrlPublicHttps: isPublicHttpsUrl(callback),
    realWebhookEndpointConfigured: Boolean(process.env.PAYTABS_REAL_WEBHOOK_ENDPOINT?.trim()),
  };
}

/** Full E2E requires HTTP credentials + public HTTPS callback for real PayTabs delivery. */
export function canRunRealSandboxE2E(
  credentialStatus: PayTabsCredentialStatus,
  webhook: PayTabsPreflightReport['webhook'],
): boolean {
  return (
    canRunRealSandboxHttp(credentialStatus) &&
    webhook.callbackUrlPublicHttps &&
    webhook.realWebhookEndpointConfigured
  );
}

export async function runPayTabsPreflight(): Promise<PayTabsPreflightReport> {
  const mode = resolvePayTabsMode();
  const credentialStatus = await assessPayTabsCredentialStatus(loadPayTabsSandboxCredentials, mode);
  const creds = credentialStatus.configured ? await loadPayTabsSandboxCredentials() : null;
  const webhook = assessWebhookReadiness(creds);
  const blockers: string[] = [];

  if (resolvePayTabsEnv() !== 'sandbox') blockers.push('PAYTABS_ENV must be sandbox');
  if (!isRealSandboxCertRequested()) blockers.push('PAYTABS_REAL_SANDBOX_CERT must be true');
  if (mode !== 'http') blockers.push('PAYTABS_ADAPTER_MODE must be http for real E2E');
  if (!credentialStatus.configured) {
    blockers.push(credentialStatus.blockedReason || 'PayTabs sandbox credentials missing');
    blockers.push(...credentialStatus.missing.map((m) => `Missing: ${m}`));
  }
  if (!webhook.callbackUrlPublicHttps) {
    blockers.push('PAYTABS_SANDBOX_CALLBACK_URL must be public HTTPS (not localhost)');
  }
  if (!webhook.realWebhookEndpointConfigured) {
    blockers.push('PAYTABS_REAL_WEBHOOK_ENDPOINT not configured (real inbound webhook blocked)');
  }

  const httpReady = canRunRealSandboxHttp(credentialStatus);
  const e2eReady = canRunRealSandboxE2E(credentialStatus, webhook);

  return {
    timestamp: new Date().toISOString(),
    env: resolvePayTabsEnv(),
    adapterMode: mode,
    certRequested: isRealSandboxCertRequested(),
    credentials: {
      configured: credentialStatus.configured,
      missing: credentialStatus.missing,
      blockedReason: credentialStatus.blockedReason,
    },
    webhook,
    httpReady,
    e2eReady,
    blockers,
  };
}

/** Safe console summary — never prints secret values. */
export function formatPreflightSummary(report: PayTabsPreflightReport): string {
  const lines = [
    `PayTabs Sandbox Preflight (${report.timestamp})`,
    `  env=${report.env} adapterMode=${report.adapterMode} certRequested=${report.certRequested}`,
    `  credentials.configured=${report.credentials.configured} missing=[${report.credentials.missing.join(', ')}]`,
    `  webhook.callbackPublicHttps=${report.webhook.callbackUrlPublicHttps} realEndpoint=${report.webhook.realWebhookEndpointConfigured}`,
    `  httpReady=${report.httpReady} e2eReady=${report.e2eReady}`,
  ];
  if (report.blockers.length) {
    lines.push('  blockers:');
    for (const b of report.blockers) lines.push(`    - ${b}`);
  }
  return lines.join('\n');
}
