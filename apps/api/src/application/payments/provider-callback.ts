import crypto from 'node:crypto';
import {pool,tx} from '../../infrastructure/db/mysql.js';
import {LedgerService} from '../ledger/service.js';
import {outbox,audit,uuid} from './shared.js';

export class ProviderCallbackService {
 constructor(private readonly ledger:LedgerService){}
 async handlePayTabs(payload:any){
  const externalEventId=String(payload?.tran_ref||payload?.cart_id||crypto.randomUUID());
  const statusCode=String(payload?.payment_result?.response_status||payload?.respStatus||'').toUpperCase();
  const cartId=String(payload?.cart_id||payload?.cartId||''); const tranRef=String(payload?.tran_ref||payload?.tranRef||'');
  const [existing]:any=await pool.query("SELECT id FROM provider_callbacks WHERE provider='paytabs' AND external_event_id=?",[externalEventId]);if(existing[0])return {received:true,deduplicated:true,event_id:externalEventId};
  const [attempts]:any=await pool.query("SELECT pa.*,ps.merchant_id,ps.customer_id,ps.reference,ps.description,ps.amount_minor session_amount,ps.currency session_currency,ps.status session_status FROM payment_attempts pa JOIN payment_sessions ps ON ps.id=pa.payment_session_id WHERE pa.provider_id='paytabs' AND (pa.provider_transaction_id=? OR pa.external_reference=? OR ps.reference=?) ORDER BY pa.created_at DESC LIMIT 1",[tranRef,cartId,cartId]);
  const attempt=attempts[0]; const tenantId=attempt?.tenant_id||null;
  await pool.query('INSERT INTO provider_callbacks(id,tenant_id,provider,external_event_id,signature_valid,payload_json,status) VALUES(?,?,?,?,?,?,?)',[uuid(),tenantId,'paytabs',externalEventId,true,JSON.stringify(payload),'RECEIVED']);
  if(!attempt)return {received:true,matched:false,event_id:externalEventId};
  if(statusCode==='A'){
   return tx(async c=>{
    const [paid]:any=await c.execute('SELECT id FROM payments WHERE payment_attempt_id=?',[attempt.id]);if(paid[0])return {received:true,deduplicated:true,event_id:externalEventId,payment_id:paid[0].id};
    const [feeRows]:any=await c.execute("SELECT percent_bps,fixed_minor FROM fee_rules WHERE tenant_id=? AND (merchant_id=? OR merchant_id IS NULL) AND (currency=? OR currency IS NULL) AND provider='paytabs' AND status='ACTIVE' ORDER BY merchant_id DESC LIMIT 1",[attempt.tenant_id,attempt.merchant_id,attempt.currency]);const fee=feeRows[0]?((BigInt(attempt.amount_minor)*BigInt(feeRows[0].percent_bps||0))/10000n)+BigInt(feeRows[0].fixed_minor||0):0n;
    const paymentId=uuid();await c.execute("UPDATE payment_attempts SET status='SUCCEEDED',authorization_status='SUCCEEDED',capture_status='SUCCEEDED',provider_transaction_id=?,failure_code=NULL,failure_message=NULL WHERE id=?",[tranRef,attempt.id]);await c.execute("UPDATE payment_sessions SET status='COMPLETED' WHERE id=?",[attempt.payment_session_id]);await c.execute('INSERT INTO payments(id,tenant_id,merchant_id,customer_id,payment_session_id,payment_attempt_id,provider_id,amount_minor,fee_minor,currency,status,risk_status,provider_transaction_id,payment_method_id,reference,description,capture_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[paymentId,attempt.tenant_id,attempt.merchant_id,attempt.customer_id,attempt.payment_session_id,attempt.id,'paytabs',attempt.amount_minor,fee.toString(),attempt.currency,'SUCCEEDED','LOW',tranRef,null,attempt.reference,attempt.description,'CAPTURED']);await this.ledger.postPayment(c,attempt.tenant_id,paymentId,attempt.merchant_id,String(attempt.amount_minor),attempt.currency,fee.toString());const result={paymentId,attemptId:attempt.id,status:'SUCCEEDED',providerTransactionId:tranRef};await outbox(c,attempt.tenant_id,'payment.succeeded','payment',paymentId,result);await audit(c,attempt.tenant_id,'payment.succeeded','payment',paymentId,null,result);await c.execute("UPDATE provider_callbacks SET status='PROCESSED',processed_at=CURRENT_TIMESTAMP(6) WHERE provider='paytabs' AND external_event_id=?",[externalEventId]);return {received:true,matched:true,...result};
   });
  }
  await pool.query("UPDATE payment_attempts SET status='FAILED',authorization_status='FAILED',failure_code=?,failure_message=? WHERE id=?",['provider_failed',String(payload?.payment_result?.response_message||payload?.respMessage||'Provider declined'),attempt.id]);await pool.query("UPDATE payment_sessions SET status='FAILED' WHERE id=?",[attempt.payment_session_id]);await pool.query("UPDATE provider_callbacks SET status='PROCESSED',processed_at=CURRENT_TIMESTAMP(6) WHERE provider='paytabs' AND external_event_id=?",[externalEventId]);return {received:true,matched:true,event_id:externalEventId,status:'FAILED'};
 }
}
