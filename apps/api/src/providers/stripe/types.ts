/** Stripe V4 adapter types — PaymentIntent / Checkout Session / Refunds. */

export type StripeCredentials = {
  secretKey: string;
  webhookSecret: string;
  publishableKey?: string;
  successUrl: string;
  cancelUrl: string;
  /** true when secretKey is sk_live_ */
  isLiveKey: boolean;
};

export type StripeCheckoutSession = {
  id: string;
  url?: string | null;
  payment_intent?: string | {id: string} | null;
  status?: string | null;
  payment_status?: string | null;
  livemode?: boolean;
};

export type StripePaymentIntent = {
  id: string;
  status?: string | null;
  client_secret?: string | null;
  amount?: number;
  currency?: string;
  last_payment_error?: {code?: string; message?: string} | null;
  livemode?: boolean;
};

export type StripeRefund = {
  id: string;
  status?: string | null;
  payment_intent?: string | null;
  amount?: number;
  currency?: string;
};

export type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data?: {object?: Record<string, unknown>};
};
