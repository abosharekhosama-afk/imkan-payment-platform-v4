import {pool,tx} from '../../infrastructure/db/mysql.js';
import type {PaymentProvider} from '../../domain/payments/provider.js';
import {LedgerService} from '../ledger/service.js';
import {audit,fail,getIdempotent,hash,outbox,saveIdempotency,uuid} from './shared.js';

export class RefundService {
  constructor(private readonly provider:PaymentProvider, private readonly ledger:LedgerService){}
  async create(paymentId:string,input:any,tenantId:string,key:string){
    const requestHash=hash({paymentId,...input});
    const existing=await getIdempotent(pool,tenantId,key,requestHash); if(existing) return existing;
    return tx(async c=>{
      const [p]:any=await c.execute('SELECT * FROM payments WHERE id=? AND tenant_id=? FOR UPDATE',[paymentId,tenantId]);
      const payment=p[0]; if(!payment) throw fail('PAYMENT_NOT_FOUND',404);
      if(!['SUCCEEDED','PARTIALLY_REFUNDED'].includes(payment.status)) throw fail('PAYMENT_NOT_REFUNDABLE',409);
      const [sum]:any=await c.execute("SELECT COALESCE(SUM(amount_minor),0) refunded FROM refunds WHERE payment_id=? AND status='SUCCESS'",[paymentId]);
      const remaining=BigInt(payment.amount_minor)-BigInt(sum[0].refunded||0); const amount=BigInt(input.amount_minor);
      if(amount<=0n||amount>remaining) throw fail('REFUND_AMOUNT_EXCEEDS_REMAINING',409);
      const provider=await this.provider.refund(payment.provider_transaction_id,amount,key);
      if(provider.status!=='SUCCESS') throw fail(provider.failureReason||'REFUND_FAILED',502);
      const refundId=uuid();
      await c.execute('INSERT INTO refunds(id,tenant_id,payment_id,amount_minor,currency,reason,provider_refund_id,status) VALUES(?,?,?,?,?,?,?,?)',[refundId,tenantId,paymentId,amount.toString(),payment.currency,input.reason??null,provider.providerRefundId,'SUCCESS']);
      await this.ledger.postRefund(c,tenantId,refundId,payment.merchant_id,amount.toString(),payment.currency);
      const newStatus=amount===remaining?'REFUNDED':'PARTIALLY_REFUNDED'; await c.execute('UPDATE payments SET status=? WHERE id=?',[newStatus,paymentId]);
      const result={id:refundId,payment_id:paymentId,amount_minor:amount.toString(),currency:payment.currency,status:'SUCCESS',provider_refund_id:provider.providerRefundId};
      await saveIdempotency(c,tenantId,key,'refunds.create',requestHash,result,201);
      await outbox(c,tenantId,'refund.succeeded','refund',refundId,result); await audit(c,tenantId,'refund.succeeded','refund',refundId,null,result);
      return result;
    });
  }
}
