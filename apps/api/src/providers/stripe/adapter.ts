import type {ProviderAdapter, ProviderEnvironment, ProviderOperationResult} from '../adapter.js';
import {ProviderError} from '../errors.js';
import {resolveStripeRequestedPlane, resolveStripeCheckoutUi} from './config.js';
import {loadStripeCredentials, resolveStripeMode} from './credentials.js';
import {createStripeClient, type StripeHttpClient} from './http-client.js';
import {mapCheckoutSession, mapPaymentIntent, mapPaymentIntentEmbedded, mapRefund} from './mappers.js';
import {verifyStripeWebhook} from './webhook.js';

const PROVIDER_CODE = 'stripe';

export class StripeAdapter implements ProviderAdapter {
  readonly code = PROVIDER_CODE;
  private clientPromise: Promise<StripeHttpClient> | null = null;

  constructor(private readonly clientOverride?: StripeHttpClient) {}

  private async client(): Promise<StripeHttpClient> {
    if (this.clientOverride) return this.clientOverride;
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const plane = resolveStripeRequestedPlane();
        const creds = await loadStripeCredentials(plane);
        if (!creds) {
          throw new ProviderError(
            'STRIPE_CREDENTIALS_MISSING',
            `Stripe ${plane} credentials not configured (STRIPE_*_SECRET_KEY / WEBHOOK_SECRET)`,
            'DISABLED',
            503,
            {providerCode: PROVIDER_CODE},
          );
        }
        return createStripeClient(creds, resolveStripeMode());
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
    // Card data never enters IMKAN — Stripe Checkout hosted page.
    if (input.paymentMethodToken && /FAIL/i.test(input.paymentMethodToken)) {
      return {
        status: 'FAILED',
        providerCode: PROVIDER_CODE,
        failureCode: 'STRIPE_DECLINED',
        failureMessage: 'Simulated Stripe decline token',
      };
    }

    try {
      const plane = resolveStripeRequestedPlane();
      const creds = await loadStripeCredentials(plane);
      if (!creds) {
        return {
          status: 'FAILED',
          providerCode: PROVIDER_CODE,
          failureCode: 'STRIPE_CREDENTIALS_MISSING',
          failureMessage: 'Stripe credentials not configured',
        };
      }
      const http = await this.client();
      if (resolveStripeCheckoutUi() === 'elements') {
        const pi = await http.createPaymentIntent({
          amountMinor: input.amountMinor,
          currencyCode: input.currencyCode,
          paymentIntentId: input.paymentIntentId,
          paymentAttemptId: input.paymentAttemptId,
          idempotencyKey: input.idempotencyKey,
        });
        return mapPaymentIntentEmbedded(pi, creds.publishableKey);
      }
      const session = await http.createCheckoutSession({
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
        paymentIntentId: input.paymentIntentId,
        paymentAttemptId: input.paymentAttemptId,
        idempotencyKey: input.idempotencyKey,
        successUrl: creds.successUrl,
        cancelUrl: creds.cancelUrl,
      });
      return mapCheckoutSession(session);
    } catch (error) {
      if (error instanceof ProviderError && error.errorClass === 'TIMEOUT') throw error;
      if (error instanceof ProviderError) {
        return {
          status: 'FAILED',
          providerCode: PROVIDER_CODE,
          failureCode: error.code,
          failureMessage: error.message,
        };
      }
      return {
        status: 'FAILED',
        providerCode: PROVIDER_CODE,
        failureCode: 'STRIPE_ERROR',
        failureMessage: String((error as Error)?.message || error),
      };
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
    // Checkout Session payment mode captures automatically.
    return {
      status: 'SUCCEEDED',
      providerCode: PROVIDER_CODE,
      providerReference: input.providerReference,
      providerTransactionId: input.providerReference,
      details: {note: 'Stripe Checkout — capture coalesced'},
    };
  }

  async voidPayment(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    if (!input.providerReference) {
      return {
        status: 'NOT_AVAILABLE',
        providerCode: PROVIDER_CODE,
        failureMessage: 'No provider reference to cancel',
      };
    }
    try {
      const http = await this.client();
      // Cancel PaymentIntent when reference is pi_*; Checkout sessions expire separately.
      if (String(input.providerReference).startsWith('pi_')) {
        const pi = await http.cancelPaymentIntent(input.providerReference);
        return mapPaymentIntent(pi);
      }
      return {
        status: 'NOT_AVAILABLE',
        providerCode: PROVIDER_CODE,
        providerReference: input.providerReference,
        failureMessage: 'Void only supported for PaymentIntent references (pi_*)',
      };
    } catch (error) {
      return {
        status: 'FAILED',
        providerCode: PROVIDER_CODE,
        failureCode: 'STRIPE_VOID_FAILED',
        failureMessage: String((error as Error)?.message || error),
      };
    }
  }

  async refund(input: {
    organizationId: string;
    paymentTransactionId: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult> {
    try {
      const http = await this.client();
      const refund = await http.createRefund({
        paymentIntentId: input.paymentTransactionId,
        amountMinor: input.amountMinor,
        idempotencyKey: input.idempotencyKey,
      });
      return mapRefund(refund);
    } catch (error) {
      return {
        status: 'FAILED',
        providerCode: PROVIDER_CODE,
        failureCode: 'STRIPE_REFUND_FAILED',
        failureMessage: String((error as Error)?.message || error),
      };
    }
  }

  async getStatus(input: {
    organizationId: string;
    providerReference: string;
  }): Promise<ProviderOperationResult> {
    try {
      const http = await this.client();
      const ref = input.providerReference;
      if (ref.startsWith('cs_')) {
        return mapCheckoutSession(await http.retrieveCheckoutSession(ref));
      }
      return mapPaymentIntent(await http.retrievePaymentIntent(ref));
    } catch (error) {
      return {
        status: 'AMBIGUOUS',
        providerCode: PROVIDER_CODE,
        providerReference: input.providerReference,
        failureMessage: String((error as Error)?.message || error),
      };
    }
  }

  async prepareCheckout(input: {
    organizationId: string;
    paymentSessionId: string;
    amountMinor: string;
    currencyCode: string;
  }): Promise<ProviderOperationResult> {
    return this.authorize({
      organizationId: input.organizationId,
      paymentIntentId: input.paymentSessionId,
      paymentAttemptId: input.paymentSessionId,
      amountMinor: input.amountMinor,
      currencyCode: input.currencyCode,
    });
  }

  async verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment: ProviderEnvironment;
    webhookSecret?: string;
  }) {
    return verifyStripeWebhook(input);
  }
}

export const stripeAdapter = new StripeAdapter();
