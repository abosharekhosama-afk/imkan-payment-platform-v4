import type {ProviderAdapter, ProviderEnvironment, ProviderOperationResult} from '../adapter.js';
import {ProviderError} from '../errors.js';
import {loadPayTabsSandboxCredentials, resolvePayTabsMode} from './credentials.js';
import {createPayTabsClient, type PayTabsHttpClient} from './http-client.js';
import {
  mapHttpErrorToProviderResult,
  mapPayTabsPaymentResponse,
  mapPayTabsQueryResponse,
} from './mappers.js';
import {verifyPayTabsWebhook} from './webhook.js';

const PROVIDER_CODE = 'paytabs';

function cartIdFrom(input: {paymentIntentId: string; paymentAttemptId?: string; idempotencyKey?: string}) {
  const base = input.idempotencyKey || input.paymentAttemptId || input.paymentIntentId;
  return base.replace(/-/g, '').slice(0, 64);
}

function amountMajor(amountMinor: string): number {
  return Number(amountMinor) / 100;
}

export class PayTabsAdapter implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  private clientPromise: Promise<PayTabsHttpClient> | null = null;

  constructor(private readonly clientOverride?: PayTabsHttpClient) {}

  private async client(): Promise<PayTabsHttpClient> {
    if (this.clientOverride) return this.clientOverride;
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const creds = await loadPayTabsSandboxCredentials();
        if (!creds) {
          throw new ProviderError(
            'PAYTABS_CREDENTIALS_MISSING',
            'PayTabs sandbox credentials not configured (SecretResolver / PAYTABS_SANDBOX_*)',
            'DISABLED',
            503,
            {providerCode: PROVIDER_CODE},
          );
        }
        return createPayTabsClient(creds, resolvePayTabsMode());
      })();
    }
    return this.clientPromise;
  }

  async authorize(input: {
    organizationId: string;
    paymentIntentId: string;
    paymentAttemptId: string;
    amountMinor: string;
    currencyCode: string;
    paymentMethodTypeCode?: string | null;
    paymentMethodToken?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    // PayTabs HPP — card data never enters IMKAN API (hosted checkout).
    if (input.paymentMethodToken && /FAIL/i.test(input.paymentMethodToken)) {
      return {
        status: 'FAILED',
        providerCode: PROVIDER_CODE,
        failureCode: 'PAYTABS_DECLINED',
        failureMessage: 'Simulated PayTabs decline token',
      };
    }

    try {
      const creds = await loadPayTabsSandboxCredentials();
      if (!creds) {
        return {
          status: 'FAILED',
          providerCode: PROVIDER_CODE,
          failureCode: 'PAYTABS_CREDENTIALS_MISSING',
          failureMessage: 'PayTabs sandbox credentials not configured',
        };
      }
      const http = await this.client();
      const cartId = cartIdFrom(input);
      const data = await http.paymentRequest({
        profile_id: creds.profileId,
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_id: cartId,
        cart_currency: input.currencyCode.toUpperCase(),
        cart_amount: amountMajor(input.amountMinor),
        cart_description: `PI:${input.paymentIntentId}`,
        callback: creds.callbackUrl,
        return: creds.returnUrl,
      });
      return mapPayTabsPaymentResponse(data, {cartId, tranType: 'sale'});
    } catch (error) {
      if (error instanceof ProviderError && error.errorClass === 'TIMEOUT') throw error;
      return mapHttpErrorToProviderResult(error);
    }
  }

  async capture(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    // PayTabs sale is auth+capture coalesced for HPP.
    return {
      status: 'SUCCEEDED',
      providerCode: PROVIDER_CODE,
      providerReference: input.providerReference,
      providerTransactionId: input.providerReference,
      details: {note: 'PayTabs HPP sale — capture coalesced'},
    };
  }

  async voidPayment(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    return {
      status: 'NOT_AVAILABLE',
      providerCode: PROVIDER_CODE,
      providerReference: input.providerReference || undefined,
      failureCode: 'PAYTABS_VOID_NOT_VERIFIED',
      failureMessage: 'PayTabs void not verified in P15.3 sandbox scope',
    };
  }

  async refund(input: {
    organizationId: string;
    paymentTransactionId: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    try {
      const creds = await loadPayTabsSandboxCredentials();
      if (!creds) {
        return {
          status: 'FAILED',
          providerCode: PROVIDER_CODE,
          failureCode: 'PAYTABS_CREDENTIALS_MISSING',
          failureMessage: 'PayTabs sandbox credentials not configured',
        };
      }
      const http = await this.client();
      const cartId = `rf_${(input.idempotencyKey || input.paymentTransactionId).replace(/-/g, '').slice(0, 40)}`;
      const data = await http.paymentRequest({
        profile_id: creds.profileId,
        tran_type: 'refund',
        tran_class: 'ecom',
        cart_id: cartId,
        cart_currency: input.currencyCode.toUpperCase(),
        cart_amount: amountMajor(input.amountMinor),
        cart_description: `Refund ${input.paymentTransactionId}`,
        tran_ref: input.paymentTransactionId,
      });
      return mapPayTabsPaymentResponse(data, {cartId, tranType: 'refund'});
    } catch (error) {
      if (error instanceof ProviderError && error.errorClass === 'TIMEOUT') throw error;
      return mapHttpErrorToProviderResult(error);
    }
  }

  async getStatus(input: {
    organizationId: string;
    providerReference: string;
  }): Promise<ProviderOperationResult> {
    try {
      const creds = await loadPayTabsSandboxCredentials();
      if (!creds) {
        return {
          status: 'FAILED',
          providerCode: PROVIDER_CODE,
          failureCode: 'PAYTABS_CREDENTIALS_MISSING',
          failureMessage: 'PayTabs sandbox credentials not configured',
        };
      }
      const http = await this.client();
      const data = await http.paymentQuery({
        profile_id: creds.profileId,
        tran_ref: input.providerReference,
      });
      return mapPayTabsQueryResponse(data);
    } catch (error) {
      return mapHttpErrorToProviderResult(error);
    }
  }

  async prepareCheckout(input: {
    organizationId: string;
    paymentSessionId: string;
    amountMinor: string;
    currencyCode: string;
  }): Promise<ProviderOperationResult> {
    return {
      status: 'PENDING',
      providerCode: PROVIDER_CODE,
      providerReference: `pt_chk_${input.paymentSessionId.replace(/-/g, '').slice(0, 16)}`,
      details: {hosted_checkout: true},
    };
  }

  verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment: ProviderEnvironment;
  }) {
    return verifyPayTabsWebhook(input);
  }
}

export const paytabsAdapter = new PayTabsAdapter();

/** Inject simulate/http client for tests. */
export function createPayTabsAdapter(client?: PayTabsHttpClient): PayTabsAdapter {
  return new PayTabsAdapter(client);
}

export {signPayTabsCallback} from './webhook.js';
