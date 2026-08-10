import {v4} from '../../api/endpoints';

export const billingApi = {
  customers: (token: string | null) => v4.customers(token),
  createCustomer: (token: string | null, body: unknown) => v4.createCustomer(token, body),
  products: (token: string | null) => v4.products(token),
  createProduct: (token: string | null, body: unknown) => v4.createProduct(token, body),
  prices: (token: string | null) => v4.prices(token),
  createPrice: (token: string | null, body: unknown) => v4.createPrice(token, body),
  subscriptions: (token: string | null) => v4.subscriptions(token),
  createSubscription: (token: string | null, body: unknown) => v4.createSubscription(token, body),
  subscriptionAction: (token: string | null, id: string, action: 'pause' | 'resume' | 'cancel') =>
    v4.subscriptionAction(token, id, action),
  invoices: (token: string | null) => v4.invoices(token),
  invoice: (token: string | null, id: string) => v4.invoice(token, id),
  collect: (token: string | null, id: string) => v4.collectInvoice(token, id),
  runRenewals: (token: string | null) => v4.runRenewals(token),
};
