/** PayTabs PT2 internal API shapes — adapter layer only; never leak to Payment Core. */

export type PayTabsTranType = 'sale' | 'auth' | 'capture' | 'void' | 'refund' | 'query' | 'register';
export type PayTabsTranClass = 'ecom' | 'recurring' | 'moto';

export type PayTabsPaymentRequest = {
  profile_id: string | number;
  tran_type: PayTabsTranType;
  tran_class: PayTabsTranClass;
  cart_id: string;
  cart_currency: string;
  cart_amount: number;
  cart_description?: string;
  callback?: string;
  return?: string;
  tran_ref?: string;
};

export type PayTabsPaymentResponse = {
  tran_ref?: string;
  redirect_url?: string;
  payment_url?: string;
  invoice_link?: string;
  payment_result?: {
    response_status?: string;
    response_code?: string;
    response_message?: string;
  };
  cart_id?: string;
  cart_amount?: number;
  cart_currency?: string;
  message?: string;
};

export type PayTabsQueryRequest = {
  profile_id: string | number;
  tran_ref?: string;
  cart_id?: string;
};

export type PayTabsCallbackPayload = Record<string, unknown> & {
  tran_ref?: string;
  cart_id?: string;
  response_status?: string;
  response_code?: string;
  response_message?: string;
  signature?: string;
  cart_amount?: string | number;
  cart_currency?: string;
  payment_result?: {response_status?: string; response_message?: string};
};

export type PayTabsCredentials = {
  baseUrl: string;
  profileId: string;
  serverKey: string;
  callbackUrl: string;
  returnUrl: string;
  webhookSecret: string;
};

export type PayTabsAdapterMode = 'simulate' | 'http';
