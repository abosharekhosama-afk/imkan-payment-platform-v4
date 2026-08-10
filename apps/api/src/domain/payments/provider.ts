export type ProviderPaymentMethodInput = {
  token: string;
  type: string;
};

export type ProviderPaymentMethodResult = {
  providerToken: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
};

export type ProviderAuthorizationInput = {
  amountMinor: bigint;
  currency: string;
  reference: string;
  idempotencyKey: string;
  paymentMethodToken?: string;
};

export type ProviderAuthorizationResult = {
  providerTransactionId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'REQUIRES_ACTION';
  failureCode?: string;
  failureMessage?: string;
  action?: {type: '3DS'; url?: string; token?: string};
};

export type ProviderCaptureResult = {
  providerTransactionId: string;
  status: 'SUCCEEDED' | 'FAILED';
  failureCode?: string;
  failureMessage?: string;
};

export type ProviderRefundResult = {
  providerRefundId: string;
  status: 'SUCCESS' | 'FAILED';
  failureReason?: string;
};

export interface PaymentProvider {
  readonly name: string;
  createPaymentMethod(input: ProviderPaymentMethodInput): Promise<ProviderPaymentMethodResult>;
  authorize(input: ProviderAuthorizationInput): Promise<ProviderAuthorizationResult>;
  capture(providerTransactionId: string, amountMinor: bigint, idempotencyKey: string): Promise<ProviderCaptureResult>;
  refund(providerTransactionId: string, amountMinor: bigint, idempotencyKey: string): Promise<ProviderRefundResult>;
}
