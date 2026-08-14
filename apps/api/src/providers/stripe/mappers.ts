import type {ProviderOperationResult, ProviderOpStatus} from '../adapter.js';
import type {StripeCheckoutSession, StripeEvent, StripePaymentIntent, StripeRefund} from './types.js';

const PROVIDER_CODE = 'stripe';

export function mapStripePaymentIntentStatus(status?: string | null): ProviderOpStatus {
  const s = String(status || '').toLowerCase();
  if (s === 'succeeded') return 'SUCCEEDED';
  if (s === 'canceled' || s === 'cancelled') return 'FAILED';
  if (s === 'processing' || s === 'requires_capture') return 'PENDING';
  if (s === 'requires_action' || s === 'requires_confirmation' || s === 'requires_payment_method') {
    return 'REQUIRES_ACTION';
  }
  return 'PENDING';
}

export function mapCheckoutSession(session: StripeCheckoutSession): ProviderOperationResult {
  const pi =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent && typeof session.payment_intent === 'object'
        ? String((session.payment_intent as {id: string}).id || '')
        : '';
  const ref = pi || session.id;
  if (session.url) {
    return {
      status: 'REQUIRES_ACTION',
      providerCode: PROVIDER_CODE,
      providerReference: ref,
      providerTransactionId: ref,
      details: {
        action: {type: '3DS', url: session.url},
        redirect_url: session.url,
        hosted_checkout: true,
        checkout_session_id: session.id,
        payment_intent_id: pi || undefined,
      },
    };
  }
  if (session.payment_status === 'paid' || session.status === 'complete') {
    return {
      status: 'SUCCEEDED',
      providerCode: PROVIDER_CODE,
      providerReference: ref,
      providerTransactionId: ref,
      details: {checkout_session_id: session.id},
    };
  }
  return {
    status: 'PENDING',
    providerCode: PROVIDER_CODE,
    providerReference: ref,
    providerTransactionId: ref,
    details: {checkout_session_id: session.id, status: session.status},
  };
}

export function mapPaymentIntentEmbedded(
  pi: StripePaymentIntent,
  publishableKey?: string,
): ProviderOperationResult {
  if (!pi.client_secret) {
    return {
      status: 'FAILED',
      providerCode: PROVIDER_CODE,
      failureCode: 'STRIPE_NO_CLIENT_SECRET',
      failureMessage: 'Stripe PaymentIntent missing client_secret',
    };
  }
  return {
    status: 'REQUIRES_ACTION',
    providerCode: PROVIDER_CODE,
    providerReference: pi.id,
    providerTransactionId: pi.id,
    details: {
      embedded: true,
      client_secret: pi.client_secret,
      publishable_key: publishableKey || null,
      payment_intent_id: pi.id,
    },
  };
}

export function mapPaymentIntent(pi: StripePaymentIntent): ProviderOperationResult {
  const status = mapStripePaymentIntentStatus(pi.status);
  return {
    status,
    providerCode: PROVIDER_CODE,
    providerReference: pi.id,
    providerTransactionId: pi.id,
    failureCode: status === 'FAILED' ? pi.last_payment_error?.code || 'STRIPE_FAILED' : undefined,
    failureMessage: status === 'FAILED' ? pi.last_payment_error?.message || 'Stripe payment failed' : undefined,
    details: {
      stripe_status: pi.status,
      client_secret: pi.client_secret ? '[PRESENT]' : undefined,
      metadata: pi.metadata || {},
    },
  };
}

export function mapRefund(refund: StripeRefund): ProviderOperationResult {
  const ok = String(refund.status || '').toLowerCase() === 'succeeded' || String(refund.status || '').toLowerCase() === 'pending';
  return {
    status: ok ? (String(refund.status).toLowerCase() === 'pending' ? 'PENDING' : 'SUCCEEDED') : 'FAILED',
    providerCode: PROVIDER_CODE,
    providerReference: refund.id,
    providerTransactionId: refund.id,
    details: {payment_intent: refund.payment_intent, amount: refund.amount},
  };
}

function idOf(value: unknown): string {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object' && 'id' in (value as object)) {
    return String((value as {id?: string}).id || '');
  }
  return '';
}

function metadataPaymentIntentId(obj: Record<string, unknown>): string | undefined {
  const meta = obj.metadata;
  if (meta && typeof meta === 'object') {
    const id = String((meta as {payment_intent_id?: string}).payment_intent_id || '').trim();
    if (id) return id;
  }
  return undefined;
}

function amountMinorOf(obj: Record<string, unknown>): string | undefined {
  const n = obj.amount ?? obj.amount_refunded ?? obj.amount_captured;
  if (typeof n === 'number' && Number.isFinite(n)) return String(Math.trunc(n));
  if (typeof n === 'string' && n.trim()) return n.trim();
  return undefined;
}

export function isStripeAuxiliaryEvent(eventType: string): boolean {
  const t = String(eventType || '').toLowerCase();
  return (
    t.includes('dispute') ||
    t.startsWith('radar.') ||
    t.includes('early_fraud') ||
    t.startsWith('payout.') ||
    t.startsWith('balance.')
  );
}

export function normalizeStripeEvent(event: StripeEvent): {
  eventType: string;
  providerReference: string;
  paymentIntentId?: string;
  amountMinor?: string;
  currencyCode?: string;
} {
  const obj = (event.data?.object || {}) as Record<string, unknown>;
  const type = String(event.type || '');
  let providerReference = '';
  let paymentIntentId: string | undefined = metadataPaymentIntentId(obj);

  if (type.startsWith('payment_intent.')) {
    providerReference = String(obj.id || '');
  } else if (type.startsWith('checkout.session.')) {
    providerReference = idOf(obj.payment_intent) || String(obj.id || '');
    if (typeof obj.client_reference_id === 'string' && obj.client_reference_id) {
      paymentIntentId = paymentIntentId || obj.client_reference_id;
    }
  } else if (type.startsWith('charge.dispute') || type.includes('dispute')) {
    providerReference = idOf(obj.payment_intent) || idOf(obj.charge) || String(obj.id || '');
  } else if (type.startsWith('radar.') || type.includes('early_fraud')) {
    providerReference = idOf(obj.payment_intent) || idOf(obj.charge) || String(obj.id || '');
  } else if (type.startsWith('charge.') || type.startsWith('refund.')) {
    providerReference = idOf(obj.payment_intent) || String(obj.id || '');
  } else if (type.startsWith('payout.') || type.startsWith('balance.')) {
    providerReference = String(obj.id || event.id);
  } else {
    providerReference = String(obj.id || event.id);
  }

  const currency = typeof obj.currency === 'string' ? obj.currency.toUpperCase() : undefined;
  return {
    eventType: type,
    providerReference,
    paymentIntentId,
    amountMinor: amountMinorOf(obj),
    currencyCode: currency,
  };
}
