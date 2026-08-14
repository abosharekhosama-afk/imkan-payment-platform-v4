import crypto from 'node:crypto';
import type {ProviderEnvironment, WebhookVerificationResult} from '../adapter.js';
import {loadStripeCredentials} from './credentials.js';
import {normalizeStripeEvent} from './mappers.js';
import type {StripeEvent} from './types.js';

const TOLERANCE_SEC = Number(process.env.STRIPE_WEBHOOK_TOLERANCE_SEC || 300);

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] || '') : String(v || '');
}

function parseStripeSignature(header: string): {t?: string; v1: string[]} {
  const out: {t?: string; v1: string[]} = {v1: []};
  for (const part of header.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't') out.t = v;
    if (k === 'v1' && v) out.v1.push(v);
  }
  return out;
}

/** Stripe webhook signing — supports whsec_ secrets (base64 payload after prefix). */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!rawBody || !signatureHeader || !webhookSecret) return false;
  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed.t || !parsed.v1.length) return false;
  const ts = Number(parsed.t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > TOLERANCE_SEC) return false;

  const signed = `${parsed.t}.${rawBody}`;
  const secrets: Array<string | Buffer> = [webhookSecret];
  if (webhookSecret.startsWith('whsec_')) {
    try {
      secrets.push(Buffer.from(webhookSecret.slice(6), 'base64'));
    } catch {
      /* ignore */
    }
  }

  for (const secret of secrets) {
    const expected = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
    for (const candidate of parsed.v1) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
      } catch {
        /* length mismatch */
      }
    }
  }
  return false;
}

/** Test helper — build Stripe-Signature header. */
export function signStripePayload(rawBody: string, webhookSecret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  let key: string | Buffer = webhookSecret;
  if (webhookSecret.startsWith('whsec_')) {
    try {
      key = Buffer.from(webhookSecret.slice(6), 'base64');
    } catch {
      key = webhookSecret;
    }
  }
  const v1 = crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export async function verifyStripeWebhook(input: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  environment: ProviderEnvironment;
  webhookSecret?: string;
}): Promise<WebhookVerificationResult> {
  const plane = input.environment === 'LIVE' ? 'live' : 'test';
  const creds = await loadStripeCredentials(plane);
  const secret = input.webhookSecret || creds?.webhookSecret;
  if (!secret) {
    return {valid: false, error: `Stripe ${plane} webhook secret not configured`};
  }

  const sig = headerValue(input.headers, 'stripe-signature');
  if (!verifyStripeSignature(input.rawBody, sig, secret)) {
    return {valid: false, error: 'Invalid Stripe webhook signature'};
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(input.rawBody) as StripeEvent;
  } catch {
    return {valid: false, error: 'Malformed Stripe event JSON'};
  }

  if (!event.id || !event.type) {
    return {valid: false, error: 'Missing Stripe event id/type'};
  }

  // Reject plane mismatch (test event on LIVE endpoint / vice versa)
  if (input.environment === 'LIVE' && event.livemode === false) {
    return {valid: false, error: 'Test-mode Stripe event rejected on LIVE plane', providerEventId: event.id};
  }
  if (input.environment === 'SANDBOX' && event.livemode === true) {
    return {valid: false, error: 'Live-mode Stripe event rejected on SANDBOX plane', providerEventId: event.id};
  }

  const normalized = normalizeStripeEvent(event);
  return {
    valid: true,
    event: {
      providerEventId: event.id,
      eventType: normalized.eventType,
      providerReference: normalized.providerReference,
      paymentIntentId: normalized.paymentIntentId,
      organizationId: undefined,
      environment: input.environment,
      payload: {
        ...(event as unknown as Record<string, unknown>),
        amount_minor: normalized.amountMinor,
        currency_code: normalized.currencyCode,
        stripe_object: event.data?.object || {},
      },
    },
    nonce: event.id,
    timestamp: Math.floor(Date.now() / 1000),
  };
}
