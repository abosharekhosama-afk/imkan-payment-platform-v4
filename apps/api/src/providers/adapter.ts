/**
 * Canonical V4 Provider Adapter contract.
 * Provider-specific HTTP/SDK details stay inside adapters — never in Payment Core.
 */

export type ProviderEnvironment = 'SANDBOX' | 'LIVE';

export type ProviderOpStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PENDING'
  | 'REQUIRES_ACTION'
  | 'NOT_AVAILABLE'
  | 'AMBIGUOUS';

export type ProviderOperationResult = {
  status: ProviderOpStatus;
  providerCode: string;
  providerReference?: string;
  providerTransactionId?: string;
  failureCode?: string;
  failureMessage?: string;
  details?: Record<string, unknown>;
};

export type NormalizedWebhookEvent = {
  providerEventId: string;
  eventType: string;
  providerReference?: string;
  paymentIntentId?: string;
  organizationId?: string;
  environment: ProviderEnvironment;
  payload: Record<string, unknown>;
};

export type WebhookVerificationResult =
  | {valid: true; event: NormalizedWebhookEvent; nonce?: string; timestamp?: number}
  | {valid: false; error: string; providerEventId?: string};

export interface ProviderAdapter {
  readonly code: string;

  authorize(input: {
    organizationId: string;
    paymentIntentId: string;
    paymentAttemptId: string;
    amountMinor: string;
    currencyCode: string;
    paymentMethodTypeCode?: string | null;
    paymentMethodToken?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult>;

  capture(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult>;

  voidPayment(input: {
    organizationId: string;
    paymentIntentId: string;
    providerReference?: string | null;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult>;

  refund(input: {
    organizationId: string;
    paymentTransactionId: string;
    amountMinor: string;
    currencyCode: string;
    idempotencyKey?: string;
  }): Promise<ProviderOperationResult>;

  getStatus(input: {
    organizationId: string;
    providerReference: string;
  }): Promise<ProviderOperationResult>;

  tokenize?(input: {
    organizationId: string;
    paymentMethodToken?: string | null;
  }): Promise<ProviderOperationResult>;

  prepareCheckout?(input: {
    organizationId: string;
    paymentSessionId: string;
    amountMinor: string;
    currencyCode: string;
  }): Promise<ProviderOperationResult>;

  /** Verify signature + normalize. Must never return valid:true without cryptographic check. */
  verifyWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment: ProviderEnvironment;
  }): Promise<WebhookVerificationResult>;
}
