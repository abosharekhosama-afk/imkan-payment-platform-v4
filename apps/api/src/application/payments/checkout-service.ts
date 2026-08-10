import crypto from 'node:crypto';
import {pool} from '../../infrastructure/db/mysql.js';
import {fail} from './shared.js';
import {PaymentService} from './payment-service.js';
import {PaymentLinkService} from './payment-link-service.js';

export class CheckoutService {
  constructor(private readonly payments:PaymentService, private readonly links:PaymentLinkService){}
  async get(token:string){return this.links.getPublic(token);}
  async pay(token:string,idempotencyKey:string,paymentMethodToken?:string){
    const link=await this.links.getPublic(token);
    const key=idempotencyKey||crypto.randomUUID();
    const session=await this.payments.createSession({merchant_id:link.merchant_id,customer_id:null,amount_minor:String(link.amount_minor),currency:link.currency,reference:link.reference,description:link.description},link.tenant_id,`checkout-session:${link.id}:${key}`);
    const payment=await this.payments.pay(session.id,link.tenant_id,undefined,`checkout-pay:${link.id}:${key}`,paymentMethodToken);
    if(payment.status==='SUCCEEDED') await pool.query("UPDATE payment_links SET status='PAID' WHERE id=? AND tenant_id=? AND status='ACTIVE'",[link.id,link.tenant_id]);
    return {link_id:link.id,session,payment};
  }
}
