import type {ProviderOpStatus, ProviderOperationResult} from '../adapter.js';
import type {PayTabsCallbackPayload, PayTabsPaymentResponse} from './types.js';

const PROVIDER_CODE = 'paytabs';

/** PayTabs response_status → canonical provider status. Evidence: legacy callback + PayTabs docs. */
export function mapPayTabsResponseStatus(status?: string | null): ProviderOpStatus {
  const s = String(status || '').toUpperCase();
  if (s === 'A') return 'SUCCEEDED';
  if (s === 'P' || s === 'H') return 'PENDING';
  if (s === 'D' || s === 'E') return 'FAILED';
  if (s === 'C' || s === 'X') return 'FAILED';
  return 'PENDING';
}

export function mapPayTabsPaymentResponse(
  data: PayTabsPaymentResponse,
  context: {cartId: string; tranType: string},
): ProviderOperationResult {
  const tranRef = String(data.tran_ref || `pt_${context.cartId}`);
  const redirectUrl = data.redirect_url || data.payment_url || data.invoice_link;

  if (context.tranType === 'sale' && redirectUrl) {
    return {
      status: 'REQUIRES_ACTION',
      providerCode: PROVIDER_CODE,
      providerReference: tranRef,
      providerTransactionId: tranRef,
      details: {
        action: {type: '3DS', url: String(redirectUrl)},
        redirect_url: String(redirectUrl),
        hosted_checkout: true,
        cart_id: context.cartId,
      },
    };
  }

  const responseStatus = data.payment_result?.response_status;
  const status = mapPayTabsResponseStatus(responseStatus);
  return {
    status,
    providerCode: PROVIDER_CODE,
    providerReference: tranRef,
    providerTransactionId: tranRef,
    failureCode: status === 'FAILED' ? data.payment_result?.response_code || 'PAYTABS_DECLINED' : undefined,
    failureMessage:
      status === 'FAILED'
        ? data.payment_result?.response_message || data.message || 'PayTabs reported failure'
        : undefined,
    details: {cart_id: context.cartId, response_status: responseStatus},
  };
}

export function mapPayTabsQueryResponse(data: PayTabsPaymentResponse): ProviderOperationResult {
  const tranRef = String(data.tran_ref || '');
  const responseStatus = data.payment_result?.response_status;
  const status = mapPayTabsResponseStatus(responseStatus);
  return {
    status,
    providerCode: PROVIDER_CODE,
    providerReference: tranRef,
    providerTransactionId: tranRef,
    failureCode: status === 'FAILED' ? data.payment_result?.response_code || 'PAYTABS_QUERY_FAILED' : undefined,
    failureMessage: status === 'FAILED' ? data.payment_result?.response_message : undefined,
    details: {response_status: responseStatus},
  };
}

export function normalizePayTabsWebhookEvent(payload: PayTabsCallbackPayload): {
  eventType: string;
  providerReference: string;
  responseStatus: string;
  amountMinor?: string;
  currencyCode?: string;
} {
  const responseStatus = String(
    payload.response_status || payload.payment_result?.response_status || '',
  ).toUpperCase();
  const tranRef = String(payload.tran_ref || '');
  const cartId = String(payload.cart_id || '');

  let eventType = 'paytabs.payment.updated';
  if (responseStatus === 'A') eventType = 'paytabs.payment.succeeded';
  else if (responseStatus === 'D' || responseStatus === 'E') eventType = 'paytabs.payment.failed';
  else if (responseStatus === 'C' || responseStatus === 'X') eventType = 'paytabs.payment.cancelled';
  else if (/refund/i.test(String(payload.tran_type || ''))) eventType = 'paytabs.refund.succeeded';

  const amountRaw = payload.cart_amount;
  const amountMinor =
    amountRaw !== undefined && amountRaw !== null
      ? String(Math.round(Number(amountRaw) * 100))
      : undefined;

  return {
    eventType,
    providerReference: tranRef || cartId,
    responseStatus,
    amountMinor,
    currencyCode: payload.cart_currency ? String(payload.cart_currency).toUpperCase() : undefined,
  };
}

export function mapHttpErrorToProviderResult(error: unknown): ProviderOperationResult {
  const e = error as {code?: string; message?: string; statusCode?: number};
  if (e?.code === 'PAYTABS_TIMEOUT') {
    return {
      status: 'AMBIGUOUS',
      providerCode: PROVIDER_CODE,
      failureCode: 'PAYTABS_TIMEOUT',
      failureMessage: e.message || 'PayTabs request timed out',
    };
  }
  return {
    status: 'FAILED',
    providerCode: PROVIDER_CODE,
    failureCode: e?.code || 'PAYTABS_ERROR',
    failureMessage: e?.message || 'PayTabs request failed',
  };
}
