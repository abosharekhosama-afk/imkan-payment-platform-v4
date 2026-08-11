import {ProviderError} from '../errors.js';
import type {PayTabsCredentials, PayTabsPaymentRequest, PayTabsPaymentResponse, PayTabsQueryRequest} from './types.js';
import crypto from 'node:crypto';

export type PayTabsHttpClient = {
  paymentRequest(body: PayTabsPaymentRequest): Promise<PayTabsPaymentResponse>;
  paymentQuery(body: PayTabsQueryRequest): Promise<PayTabsPaymentResponse>;
};

const DEFAULT_TIMEOUT_MS = Number(process.env.PAYTABS_TIMEOUT_MS || process.env.PROVIDER_TIMEOUT_MS || 12_000);

function correlationId(cartId?: string): string {
  const suffix = cartId ? cartId.slice(0, 12) : crypto.randomBytes(4).toString('hex');
  return `pt-${Date.now().toString(36)}-${suffix}`;
}

function classifyHttpStatus(status: number): ProviderError['errorClass'] {
  if (status === 401 || status === 403) return 'AUTHENTICATION';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'RETRYABLE';
  if (status === 408 || status === 504) return 'TIMEOUT';
  return 'NON_RETRYABLE';
}

function redactForLog(body: Record<string, unknown>): Record<string, unknown> {
  const out = {...body};
  for (const k of Object.keys(out)) {
    if (/key|secret|token|authorization|password/i.test(k)) out[k] = '[REDACTED]';
  }
  if ('authorization' in out) out.authorization = '[REDACTED]';
  return out;
}

async function postJson(
  creds: PayTabsCredentials,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<PayTabsPaymentResponse> {
  const corrId = correlationId(String(body.cart_id || ''));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetchImpl(`${creds.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: creds.serverKey,
        'X-Request-Id': corrId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const text = await response.text();
    let data: PayTabsPaymentResponse = {};
    try {
      data = text ? (JSON.parse(text) as PayTabsPaymentResponse) : {};
    } catch {
      throw new ProviderError(
        'PAYTABS_MALFORMED_RESPONSE',
        'PayTabs returned non-JSON response',
        'NON_RETRYABLE',
        502,
        {
          providerCode: 'paytabs',
          details: redactForLog({status: response.status, correlation_id: corrId, latency_ms: latencyMs}),
        },
      );
    }

    if (!response.ok) {
      const errorClass = classifyHttpStatus(response.status);
      throw new ProviderError(
        'PAYTABS_HTTP_ERROR',
        data.message || data.payment_result?.response_message || `PayTabs HTTP ${response.status}`,
        errorClass,
        response.status >= 500 ? 502 : response.status,
        {
          providerCode: 'paytabs',
          details: redactForLog({
            correlation_id: corrId,
            latency_ms: latencyMs,
            http_status: response.status,
            path,
          }),
        },
      );
    }

    if (data.payment_result?.response_status === 'E') {
      throw new ProviderError(
        'PAYTABS_ERROR',
        data.payment_result.response_message || 'PayTabs error response',
        'NON_RETRYABLE',
        422,
        {
          providerCode: 'paytabs',
          details: {correlation_id: corrId, latency_ms: latencyMs},
        },
      );
    }

    return {...data, _imkan_meta: {correlation_id: corrId, latency_ms: latencyMs}} as PayTabsPaymentResponse;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new ProviderError('PAYTABS_TIMEOUT', 'PayTabs request timed out', 'TIMEOUT', 504, {
        providerCode: 'paytabs',
        details: {correlation_id: corrId},
      });
    }
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      'PAYTABS_NETWORK_ERROR',
      error?.message || 'PayTabs network failure',
      'AMBIGUOUS',
      504,
      {providerCode: 'paytabs', details: {correlation_id: corrId}},
    );
  } finally {
    clearTimeout(timer);
  }
}

export function createPayTabsHttpClient(
  creds: PayTabsCredentials,
  fetchImpl: typeof fetch = fetch,
): PayTabsHttpClient {
  return {
    paymentRequest: (body) => postJson(creds, '/payment/request', body as Record<string, unknown>, fetchImpl),
    paymentQuery: (body) => postJson(creds, '/payment/query', body as Record<string, unknown>, fetchImpl),
  };
}

/** Deterministic simulate client for sandbox certification without LIVE credentials. */
export function createPayTabsSimulateClient(creds: PayTabsCredentials): PayTabsHttpClient {
  const store = new Map<string, PayTabsPaymentResponse>();

  return {
    async paymentRequest(body) {
      const cartId = String(body.cart_id);
      if (body.tran_type === 'refund') {
        const original = store.get(String(body.tran_ref || ''));
        if (!original) {
          return {
            tran_ref: `TST_RF_${Date.now()}`,
            payment_result: {response_status: 'E', response_message: 'Original transaction not found in simulate store'},
          };
        }
        const refundRef = `TST_RF_${String(body.tran_ref).slice(-8)}_${Date.now().toString(36)}`;
        return {
          tran_ref: refundRef,
          payment_result: {response_status: 'A', response_message: 'Refund accepted (simulate)'},
          cart_id: cartId,
          cart_amount: body.cart_amount,
          cart_currency: body.cart_currency,
        };
      }

      if (body.tran_type === 'sale') {
        if (/FAIL/i.test(cartId)) {
          return {
            tran_ref: `TST_FAIL_${cartId.slice(0, 12)}`,
            payment_result: {response_status: 'D', response_message: 'Simulated decline'},
          };
        }
        if (/TIMEOUT/i.test(cartId)) {
          throw new ProviderError('PAYTABS_TIMEOUT', 'Simulated timeout', 'TIMEOUT', 504, {providerCode: 'paytabs'});
        }
        const tranRef = `TST${Date.now().toString().slice(-10)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const resp: PayTabsPaymentResponse = {
          tran_ref: tranRef,
          redirect_url: `https://sandbox.paytabs.test/checkout/${tranRef}?cart=${encodeURIComponent(cartId)}`,
          cart_id: cartId,
        };
        store.set(tranRef, resp);
        return resp;
      }

      return {payment_result: {response_status: 'E', response_message: `Unsupported simulate tran_type ${body.tran_type}`}};
    },

    async paymentQuery(body) {
      const ref = String(body.tran_ref || '');
      const stored = store.get(ref);
      if (stored) {
        return {
          tran_ref: ref,
          payment_result: {response_status: 'A', response_message: 'Authorized (simulate)'},
        };
      }
      if (ref.startsWith('TST_FAIL')) {
        return {tran_ref: ref, payment_result: {response_status: 'D', response_message: 'Declined (simulate)'}};
      }
      if (ref.startsWith('TST')) {
        return {tran_ref: ref, payment_result: {response_status: 'P', response_message: 'Pending (simulate)'}};
      }
      return {payment_result: {response_status: 'E', response_message: 'Unknown tran_ref (simulate)'}};
    },
  };
}

export function createPayTabsClient(
  creds: PayTabsCredentials,
  mode: 'simulate' | 'http',
  fetchImpl?: typeof fetch,
): PayTabsHttpClient {
  if (mode === 'simulate') return createPayTabsSimulateClient(creds);
  return createPayTabsHttpClient(creds, fetchImpl);
}
