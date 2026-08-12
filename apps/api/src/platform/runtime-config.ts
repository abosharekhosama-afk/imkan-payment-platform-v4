/**
 * P16 — Platform runtime surface (non-provider).
 * Exposes which sandbox/mock features are allowed in this deployment.
 * PayTabs certification/LIVE remains a separate P15.x track.
 */
import {config} from '../config.js';
import {isEmailDeliveryProduction} from './email-transport.js';
import {isDocumentStorageProduction} from './document-storage.js';

export type PlatformRuntimeConfig = {
  deployment_mode: 'development' | 'production';
  app_env: string;
  payment_provider: string;
  payment_rail: 'internal_sandbox' | 'none' | 'external';
  allow_sandbox_payment_tokens: boolean;
  require_kyb_for_payments: boolean;
  require_email_verification: boolean;
  expose_dev_tokens: boolean;
  session_transport: string;
  production_gate_passed: false;
  excluded_from_p16: ['paytabs_live', 'paytabs_real_sandbox_cert'];
  features: {
    email_delivery: 'stub' | 'production';
    kyb_vendor: 'manual' | 'production';
    document_storage: 'metadata_only' | 'production';
    payout_rail: 'mark_paid_internal' | 'production';
    settlement_import: 'internal_only' | 'production';
    merchant_webhooks_v4: 'stub' | 'production';
    checkout_sandbox_tokens: 'allowed' | 'blocked';
  };
  labels: {
    console_rail: string;
    checkout_banner: string;
  };
};

/** Magic sandbox tokens (tok_ok, tok_FAIL, …) — blocked in production unless explicitly allowed for staging. */
export function allowSandboxPaymentTokens(): boolean {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return true;
  const provider = (process.env.PAYMENT_PROVIDER || '').toLowerCase();
  if (provider !== 'sandbox') return false;
  return (process.env.ALLOW_SANDBOX_TOKENS_IN_PRODUCTION || '').toLowerCase() === 'true';
}

export function isSandboxPaymentToken(token: string | undefined | null): boolean {
  const t = String(token || '').trim();
  if (!t) return false;
  return /^tok_/i.test(t) || /^sbx_/i.test(t);
}

export function getPlatformRuntimeConfig(): PlatformRuntimeConfig {
  const allowTokens = allowSandboxPaymentTokens();
  const prod = process.env.NODE_ENV === 'production';
  const provider = (config.paymentProvider || process.env.PAYMENT_PROVIDER || 'sandbox').toLowerCase();
  const rail = provider === 'sandbox' ? 'internal_sandbox' : provider === 'none' ? 'none' : 'external';

  return {
    deployment_mode: prod ? 'production' : 'development',
    app_env: config.appEnv,
    payment_provider: config.paymentProvider || provider || 'sandbox',
    payment_rail: rail,
    allow_sandbox_payment_tokens: allowTokens,
    require_kyb_for_payments: config.requireKybForPayments,
    require_email_verification: config.requireEmailVerification,
    expose_dev_tokens: config.exposeDevTokens,
    session_transport: config.sessionTransport,
    production_gate_passed: false,
    excluded_from_p16: ['paytabs_live', 'paytabs_real_sandbox_cert'],
    features: {
      email_delivery: isEmailDeliveryProduction() ? 'production' : 'stub',
      kyb_vendor: 'manual',
      document_storage: isDocumentStorageProduction() ? 'production' : 'metadata_only',
      payout_rail: 'mark_paid_internal',
      settlement_import: 'internal_only',
        merchant_webhooks_v4: config.outboxWorkerEnabled ? 'production' : 'stub',
      checkout_sandbox_tokens: allowTokens ? 'allowed' : 'blocked',
    },
    labels: {
      console_rail:
        rail === 'internal_sandbox'
          ? prod
            ? 'STAGING — INTERNAL SANDBOX RAIL'
            : 'SANDBOX RAIL'
          : rail === 'none'
            ? 'NO PAYMENT RAIL'
            : 'PROVIDER RAIL',
      checkout_banner: allowTokens ? 'SANDBOX CHECKOUT' : 'SECURE CHECKOUT',
    },
  };
}
