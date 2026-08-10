import {v4} from '../../api/endpoints';

/** Feature API module — Payments / Links / Config (verified /api/v1). */
export const paymentsApi = {
  dashboard: (token: string | null) => v4.dashboardSummary(token),
  list: (token: string | null, q?: string) => v4.payments(token, q),
  get: (token: string | null, id: string) => v4.payment(token, id),
  cancel: (token: string | null, id: string) => v4.cancelPayment(token, id),
  links: (token: string | null, q?: string) => v4.paymentLinks(token, q),
  link: (token: string | null, id: string) => v4.paymentLink(token, id),
  createLink: (token: string | null, body: unknown) => v4.createPaymentLink(token, body),
  linkAction: (token: string | null, id: string, action: string) => v4.paymentLinkAction(token, id, action),
  config: (token: string | null) => v4.paymentConfig(token),
  saveConfig: (token: string | null, body: unknown) => v4.putPaymentConfig(token, body),
};
