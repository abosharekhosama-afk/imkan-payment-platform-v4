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

export function normalizeStripeEvent(event: StripeEvent): {
  eventType: string;
  providerReference: string;
  paymentIntentId?: string;
} {
  const obj = event.data?.object || {};
  const type = String(event.type || '');
  let providerReference = '';
  let paymentIntentId: string | undefined;

  if (type.startsWith('payment_intent.')) {
    providerReference = String(obj.id || '');
    paymentIntentId = typeof obj.metadata === 'object' && obj.metadata
      ? String((obj.metadata as any).payment_intent_id || '') || undefined
      : undefined;
  } else if (type.startsWith('checkout.session.')) {
    const pi = obj.payment_intent;
    providerReference =
      typeof pi === 'string' ? pi : pi && typeof pi === 'object' ? String((pi as any).id || '') : String(obj.id || '');
    paymentIntentId =
      typeof obj.client_reference_id === 'string'
        ? obj.client_reference_id
        : typeof obj.metadata === 'object' && obj.metadata
          ? String((obj.metadata as any).payment_intent_id || '') || undefined
          : undefined;
  } else if (type.startsWith('charge.')) {
    providerReference = String(obj.payment_intent || obj.id || '');
  } else {
    providerReference = String(obj.id || event.id);
  }

  return {eventType: type, providerReference, paymentIntentId};
}
