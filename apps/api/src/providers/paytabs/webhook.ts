import crypto from 'node:crypto';
import type {ProviderEnvironment, WebhookVerificationResult} from '../adapter.js';
import {loadPayTabsSandboxCredentials} from './credentials.js';
import {payTabsLiveEnabled} from './config.js';
import {normalizePayTabsWebhookEvent} from './mappers.js';
import type {PayTabsCallbackPayload} from './types.js';

function parseCallbackBody(rawBody: string): PayTabsCallbackPayload {
  const trimmed = rawBody.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as PayTabsCallbackPayload;
  }
  // application/x-www-form-urlencoded fallback
  const out: Record<string, string> = {};
  for (const part of trimmed.split('&')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = decodeURIComponent(part.slice(0, idx));
    const v = decodeURIComponent(part.slice(idx + 1));
    out[k] = v;
  }
  return out as PayTabsCallbackPayload;
}

/**
 * PayTabs callback signature: HMAC-SHA256 over sorted key=value pairs (legacy verified).
 * Evidence: apps/api/src/infrastructure/providers/paytabs.ts verifySignature
 * PayTabs Technical Portal — callback signature section.
 */
export function verifyPayTabsCallbackSignature(payload: PayTabsCallbackPayload, serverKey: string): boolean {
  const signature = String(payload.signature || '');
  if (!signature || !serverKey) return false;
  const copy: Record<string, unknown> = {...payload};
  delete copy.signature;
  const raw = Object.keys(copy)
    .filter((k) => copy[k] !== '' && copy[k] !== null && copy[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(copy[k]))}`)
    .join('&');
  const expected = crypto.createHmac('sha256', serverKey).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function verifyPayTabsWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  environment: ProviderEnvironment;
  webhookSecret?: string;
}): Promise<WebhookVerificationResult> {
  if (input.environment === 'LIVE' && !payTabsLiveEnabled()) {
    return {valid: false, error: 'PayTabs LIVE webhooks require PAYTABS_ALLOW_LIVE=true'};
  }

  let payload: PayTabsCallbackPayload;
  try {
    payload = parseCallbackBody(input.rawBody);
  } catch {
    return {valid: false, error: 'Malformed PayTabs callback payload'};
  }

  const creds = await loadPayTabsSandboxCredentials();
  const secret = input.webhookSecret || creds?.webhookSecret;
  if (!secret) {
    return {valid: false, error: 'PayTabs webhook secret not configured'};
  }

  if (!verifyPayTabsCallbackSignature(payload, secret)) {
    return {
      valid: false,
      error: 'Invalid PayTabs callback signature',
      providerEventId: payload.tran_ref ? String(payload.tran_ref) : undefined,
    };
  }

  const tranRef = String(payload.tran_ref || '');
  const cartId = String(payload.cart_id || '');
  if (!tranRef && !cartId) {
    return {valid: false, error: 'Missing tran_ref and cart_id in PayTabs callback'};
  }

  const normalized = normalizePayTabsWebhookEvent(payload);
  const providerEventId = tranRef || `cart:${cartId}:${normalized.responseStatus}`;

  return {
    valid: true,
    event: {
      providerEventId,
      eventType: normalized.eventType,
      providerReference: normalized.providerReference,
      paymentIntentId: undefined,
      organizationId: undefined,
      environment: input.environment,
      payload: {
        ...payload,
        amount_minor: normalized.amountMinor,
        currency_code: normalized.currencyCode,
      },
    },
    nonce: providerEventId,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

/** Test helper — sign PayTabs callback payload. */
export function signPayTabsCallback(
  payload: Record<string, unknown>,
  serverKey: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {...payload};
  delete copy.signature;
  const raw = Object.keys(copy)
    .filter((k) => copy[k] !== '' && copy[k] !== null && copy[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(copy[k]))}`)
    .join('&');
  const signature = crypto.createHmac('sha256', serverKey).update(raw).digest('hex');
  return {...payload, signature};
}
