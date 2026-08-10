import {LedgerService} from '../ledger/service.js';
import {createPaymentProvider} from '../../infrastructure/providers/index.js';
import {PaymentService} from './payment-service.js';
import {RefundService} from './refund-service.js';
import {PaymentLinkService} from './payment-link-service.js';
import {CheckoutService} from './checkout-service.js';

const provider=createPaymentProvider();
const ledger=new LedgerService();
const paymentService=new PaymentService(provider,ledger);
const refundService=new RefundService(provider,ledger);
const linkService=new PaymentLinkService(paymentService);
const checkoutService=new CheckoutService(paymentService,linkService);

export class PaymentApplicationService {
  createSession(...args:any[]){return (paymentService.createSession as any)(...args)}
  getSession(...args:any[]){return (paymentService.getSession as any)(...args)}
  getPaymentDetails(...args:any[]){return (paymentService.getPaymentDetails as any)(...args)}
  pay(...args:any[]){return (paymentService.pay as any)(...args)}
  createPaymentMethodSession(...args:any[]){return (paymentService.createPaymentMethodSession as any)(...args)}
  createPaymentMethod(...args:any[]){return (paymentService.createPaymentMethod as any)(...args)}
  confirmPaymentMethodSession(...args:any[]){return (paymentService.confirmPaymentMethodSession as any)(...args)}
  listPaymentMethods(...args:any[]){return (paymentService.listPaymentMethods as any)(...args)}
  refund(...args:any[]){return (refundService.create as any)(...args)}
  getBalance(...args:any[]){return (paymentService.getBalance as any)(...args)}
  createPaymentLink(...args:any[]){return (linkService.create as any)(...args)}
  getPaymentLink(...args:any[]){return (linkService.get as any)(...args)}
  getPublicPaymentLink(...args:any[]){return (checkoutService.get as any)(...args)}
  payPublicPaymentLink(...args:any[]){return (checkoutService.pay as any)(...args)}
  payLink(...args:any[]){return (linkService.pay as any)(...args)}
}

export const service=new PaymentApplicationService();
