import {ProviderError} from '../errors.js';
import type {StripeCheckoutSession, StripeCredentials, StripePaymentIntent, StripeRefund} from './types.js';
import {resolveStripeThreeDs} from './config.js';
import crypto from 'node:crypto';

export type StripeHttpClient = {
  createPaymentIntent(input: {
    amountMinor: string;
    currencyCode: string;
    paymentIntentId: string;
    paymentAttemptId: string;
    idempotencyKey?: string;
  }): Promise<StripePaymentIntent>;
  createCheckoutSession(input: {
    amountMinor: string;
    currencyCode: string;
    paymentIntentId: string;
    paymentAttemptId: string;
    idempotencyKey?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<StripeCheckoutSession>;
  retrievePaymentIntent(id: string): Promise<StripePaymentIntent>;
  retrieveCheckoutSession(id: string): Promise<StripeCheckoutSession>;
  createRefund(input: {
    paymentIntentId: string;
    amountMinor: string;
    idempotencyKey?: string;
  }): Promise<StripeRefund>;
  cancelPaymentIntent(id: string): Promise<StripePaymentIntent>;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.STRIPE_TIMEOUT_MS || process.env.PROVIDER_TIMEOUT_MS || 15_000);
const API_BASE = 'https://api.stripe.com';

function formBody(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

async function stripeRequest<T>(
  creds: StripeCredentials,
  method: string,
  path: string,
  body?: Record<string, string | number | undefined | null>,
  idempotencyKey?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const corrId = `st-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${creds.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Request-Id': corrId,
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey.slice(0, 255);

    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? formBody(body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new ProviderError('STRIPE_MALFORMED_RESPONSE', 'Stripe returned non-JSON', 'NON_RETRYABLE', 502, {
        providerCode: 'stripe',
        details: {correlation_id: corrId, http_status: response.status},
      });
    }
    if (!response.ok) {
      const msg = data?.error?.message || `Stripe HTTP ${response.status}`;
      const errorClass =
        response.status === 401 || response.status === 403
          ? 'AUTHENTICATION'
          : response.status === 429
            ? 'RATE_LIMITED'
            : response.status >= 500
              ? 'RETRYABLE'
              : 'NON_RETRYABLE';
      throw new ProviderError('STRIPE_HTTP_ERROR', msg, errorClass, response.status >= 500 ? 502 : response.status, {
        providerCode: 'stripe',
        details: {correlation_id: corrId, http_status: response.status, code: data?.error?.code},
      });
    }
    return data as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if ((error as any)?.name === 'AbortError') {
      throw new ProviderError('STRIPE_TIMEOUT', 'Stripe request timed out', 'TIMEOUT', 504, {
        providerCode: 'stripe',
        details: {correlation_id: corrId},
      });
    }
    throw new ProviderError('STRIPE_NETWORK_ERROR', String((error as Error)?.message || error), 'RETRYABLE', 502, {
      providerCode: 'stripe',
    });
  } finally {
    clearTimeout(timer);
  }
}

export function createStripeClient(
  creds: StripeCredentials,
  mode: 'simulate' | 'http',
  fetchImpl: typeof fetch = fetch,
): StripeHttpClient {
  if (mode === 'simulate') {
    return {
      async createPaymentIntent(input) {
        const id = `pi_test_sim_${input.paymentIntentId.replace(/-/g, '').slice(0, 16)}`;
        return {
          id,
          status: 'requires_payment_method',
          client_secret: `${id}_secret_sim`,
          amount: Number(input.amountMinor),
          currency: input.currencyCode.toLowerCase(),
          livemode: false,
        };
      },
      async createCheckoutSession(input) {
        const id = `cs_test_sim_${input.paymentAttemptId.replace(/-/g, '').slice(0, 16)}`;
        const pi = `pi_test_sim_${input.paymentIntentId.replace(/-/g, '').slice(0, 16)}`;
        return {
          id,
          url: `https://checkout.stripe.com/c/pay/${id}`,
          payment_intent: pi,
          status: 'open',
          payment_status: 'unpaid',
          livemode: false,
        };
      },
      async retrievePaymentIntent(id) {
        if (/FAIL/i.test(id)) {
          return {id, status: 'requires_payment_method', last_payment_error: {code: 'card_declined', message: 'Simulated decline'}};
        }
        if (/PEND/i.test(id)) return {id, status: 'processing'};
        return {id, status: 'succeeded', amount: 1000, currency: 'usd', livemode: false};
      },
      async retrieveCheckoutSession(id) {
        return {
          id,
          url: null,
          payment_intent: `pi_from_${id}`,
          status: 'complete',
          payment_status: 'paid',
          livemode: false,
        };
      },
      async createRefund(input) {
        return {
          id: `re_sim_${crypto.randomBytes(6).toString('hex')}`,
          status: 'succeeded',
          payment_intent: input.paymentIntentId,
          amount: Number(input.amountMinor),
          currency: 'usd',
        };
      },
      async cancelPaymentIntent(id) {
        return {id, status: 'canceled', livemode: false};
      },
    };
  }

  return {
    createPaymentIntent(input) {
      return stripeRequest<StripePaymentIntent>(
        creds,
        'POST',
        '/v1/payment_intents',
        {
          amount: Number(input.amountMinor),
          currency: input.currencyCode.toLowerCase(),
          'payment_method_types[]': 'card',
          'payment_method_options[card][request_three_d_secure]': resolveStripeThreeDs(),
          'metadata[payment_intent_id]': input.paymentIntentId,
          'metadata[payment_attempt_id]': input.paymentAttemptId,
        },
        input.idempotencyKey || input.paymentAttemptId,
        fetchImpl,
      );
    },
    createCheckoutSession(input) {
      return stripeRequest<StripeCheckoutSession>(
        creds,
        'POST',
        '/v1/checkout/sessions',
        {
          mode: 'payment',
          success_url: `${input.successUrl}${input.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: input.cancelUrl,
          'line_items[0][price_data][currency]': input.currencyCode.toLowerCase(),
          'line_items[0][price_data][product_data][name]': `Payment ${input.paymentIntentId}`,
          'line_items[0][price_data][unit_amount]': Number(input.amountMinor),
          'line_items[0][quantity]': 1,
          client_reference_id: input.paymentIntentId,
          'metadata[payment_intent_id]': input.paymentIntentId,
          'metadata[payment_attempt_id]': input.paymentAttemptId,
          'payment_intent_data[metadata][payment_intent_id]': input.paymentIntentId,
          'payment_intent_data[payment_method_options][card][request_three_d_secure]': resolveStripeThreeDs(),
        },
        input.idempotencyKey || input.paymentAttemptId,
        fetchImpl,
      );
    },
    retrievePaymentIntent(id) {
      return stripeRequest<StripePaymentIntent>(creds, 'GET', `/v1/payment_intents/${encodeURIComponent(id)}`, undefined, undefined, fetchImpl);
    },
    retrieveCheckoutSession(id) {
      return stripeRequest<StripeCheckoutSession>(
        creds,
        'GET',
        `/v1/checkout/sessions/${encodeURIComponent(id)}`,
        undefined,
        undefined,
        fetchImpl,
      );
    },
    createRefund(input) {
      return stripeRequest<StripeRefund>(
        creds,
        'POST',
        '/v1/refunds',
        {
          payment_intent: input.paymentIntentId,
          amount: Number(input.amountMinor),
        },
        input.idempotencyKey,
        fetchImpl,
      );
    },
    cancelPaymentIntent(id) {
      return stripeRequest<StripePaymentIntent>(
        creds,
        'POST',
        `/v1/payment_intents/${encodeURIComponent(id)}/cancel`,
        {},
        undefined,
        fetchImpl,
      );
    },
  };
}
