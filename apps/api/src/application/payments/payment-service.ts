import crypto from 'node:crypto';
import {pool,tx} from '../../infrastructure/db/mysql.js';
import type {PaymentProvider} from '../../domain/payments/provider.js';
import {LedgerService} from '../ledger/service.js';
import {audit,fail,getIdempotent,hash,outbox,saveIdempotency,uuid} from './shared.js';
import {decryptProviderToken,encryptProviderToken} from './token-vault.js';

export class PaymentService {
  constructor(private readonly provider:PaymentProvider, private readonly ledger:LedgerService){}

  async createSession(input:any,tenantId:string,key:string){
    const requestHash=hash(input);
    const existing=await getIdempotent(pool,tenantId,key,requestHash); if(existing) return existing;
    const id=uuid();
    const result={id,tenant_id:tenantId,merchant_id:input.merchant_id,customer_id:input.customer_id??null,amount_minor:String(input.amount_minor),currency:input.currency,reference:input.reference??null,description:input.description??null,status:'OPEN'};
    await tx(async c=>{
      const [m]:any=await c.execute('SELECT id FROM merchants WHERE id=? AND tenant_id=?',[input.merchant_id,tenantId]); if(!m[0]) throw fail('MERCHANT_NOT_FOUND',404);
      if(input.customer_id){const [cu]:any=await c.execute('SELECT id FROM customers WHERE id=? AND merchant_id=? AND tenant_id=?',[input.customer_id,input.merchant_id,tenantId]);if(!cu[0]) throw fail('CUSTOMER_NOT_FOUND',404);}
      await c.execute('INSERT INTO payment_sessions(id,tenant_id,merchant_id,customer_id,amount_minor,currency,reference,description,return_url,cancel_url,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,tenantId,input.merchant_id,input.customer_id??null,input.amount_minor,input.currency,input.reference??null,input.description??null,input.return_url??null,input.cancel_url??null,input.expires_at?new Date(input.expires_at):null,'OPEN']);
      await saveIdempotency(c,tenantId,key,'payment_sessions.create',requestHash,result,201);
      await outbox(c,tenantId,'payment_session.created','payment_session',id,result); await audit(c,tenantId,'payment_session.created','payment_session',id,null,result);
    });
    return result;
  }

  async getSession(id:string,tenantId:string){const [rows]:any=await pool.query('SELECT * FROM payment_sessions WHERE id=? AND tenant_id=?',[id,tenantId]);if(!rows[0]) throw fail('NOT_FOUND',404);return rows[0];}

  async getPaymentDetails(id:string,tenantId:string){
    const [payments]:any=await pool.query('SELECT * FROM payments WHERE id=? AND tenant_id=?',[id,tenantId]); if(!payments[0]) throw fail('PAYMENT_NOT_FOUND',404);
    const payment=payments[0];
    const [attempts]:any=await pool.query('SELECT * FROM payment_attempts WHERE payment_session_id=? AND tenant_id=? ORDER BY created_at DESC',[payment.payment_session_id,tenantId]);
    const [refunds]:any=await pool.query('SELECT * FROM refunds WHERE payment_id=? AND tenant_id=? ORDER BY created_at DESC',[id,tenantId]);
    const [postings]:any=await pool.query(`SELECT lt.id,lt.reference,lt.source_type,lt.source_id,lt.currency,lt.status,lt.created_at,le.account_id,le.side,le.amount_minor,la.code account_code,la.name account_name FROM ledger_transactions lt JOIN ledger_entries le ON le.transaction_id=lt.id JOIN ledger_accounts la ON la.id=le.account_id WHERE lt.tenant_id=? AND lt.source_id=? ORDER BY lt.created_at DESC,le.side`,[tenantId,id]);
    const [events]:any=await pool.query('SELECT id,event_type,aggregate_type,aggregate_id,payload_json,status,created_at FROM outbox_events WHERE tenant_id=? AND aggregate_id=? ORDER BY created_at DESC',[tenantId,id]);
    return {payment,attempts,refunds,ledger:postings,events};
  }

  async pay(sessionId:string,tenantId:string,paymentMethodId:string|undefined,key:string,paymentMethodToken?:string){
    const requestHash=hash({sessionId,paymentMethodId:paymentMethodId??null,paymentMethodToken:paymentMethodToken?hash(paymentMethodToken):null});
    const existing=await getIdempotent(pool,tenantId,key,requestHash); if(existing) return existing;
    return tx(async c=>{
      const [srows]:any=await c.execute('SELECT * FROM payment_sessions WHERE id=? AND tenant_id=? FOR UPDATE',[sessionId,tenantId]);
      const s=srows[0]; if(!s) throw fail('NOT_FOUND',404);
      if(!['OPEN','FAILED'].includes(s.status)) throw fail('SESSION_NOT_PAYABLE',409);
      if(s.expires_at && new Date(s.expires_at).getTime()<Date.now()) throw fail('SESSION_EXPIRED',409);
      let providerToken:string|undefined;
      if(paymentMethodId){const [pm]:any=await c.execute("SELECT id,provider_token_encrypted,provider_token FROM payment_methods WHERE id=? AND tenant_id=? AND (customer_id=? OR ? IS NULL) AND status='ACTIVE'",[paymentMethodId,tenantId,s.customer_id,s.customer_id]);if(!pm[0]) throw fail('PAYMENT_METHOD_NOT_FOUND',404);providerToken=pm[0].provider_token_encrypted?decryptProviderToken(pm[0].provider_token_encrypted):pm[0].provider_token||undefined;}
      providerToken=paymentMethodToken||providerToken;
      const attemptId=uuid();
      const [feeRows]:any=await c.execute("SELECT percent_bps,fixed_minor FROM fee_rules WHERE tenant_id=? AND (merchant_id=? OR merchant_id IS NULL) AND (currency=? OR currency IS NULL) AND provider=? AND status='ACTIVE' ORDER BY merchant_id DESC LIMIT 1",[tenantId,s.merchant_id,s.currency,this.provider.name]);
      const feeMinor=feeRows[0]?((BigInt(s.amount_minor)*BigInt(feeRows[0].percent_bps||0))/10000n)+BigInt(feeRows[0].fixed_minor||0):0n;
      let riskScore=0; const riskReasons:string[]=[]; if(BigInt(s.amount_minor)>=100000n){riskScore+=30;riskReasons.push('HIGH_AMOUNT');} if(String(s.reference||'').toUpperCase().includes('RISK')){riskScore+=60;riskReasons.push('REFERENCE_RISK');}
      const riskStatus=riskScore>=80?'BLOCKED':riskScore>=50?'REVIEW':riskScore>=25?'MEDIUM':'LOW';
      await c.execute('INSERT INTO payment_attempts(id,tenant_id,payment_session_id,amount_minor,currency,status,payment_method_id,provider_id) VALUES(?,?,?,?,?,?,?,?)',[attemptId,tenantId,sessionId,s.amount_minor,s.currency,'PENDING',paymentMethodId??null,this.provider.name]);
      await c.execute('INSERT INTO risk_assessments(id,tenant_id,payment_attempt_id,score,status,reasons_json) VALUES(?,?,?,?,?,?)',[uuid(),tenantId,attemptId,riskScore,riskStatus,JSON.stringify(riskReasons)]);
      if(riskStatus==='BLOCKED'){await c.execute("UPDATE payment_attempts SET status='FAILED',failure_code='risk_blocked',failure_message='Payment blocked by sandbox risk rules' WHERE id=?",[attemptId]);await c.execute("UPDATE payment_sessions SET status='FAILED' WHERE id=?",[sessionId]);const result={attemptId,status:'FAILED',failureCode:'risk_blocked',failureMessage:'Payment blocked by sandbox risk rules',riskStatus};await saveIdempotency(c,tenantId,key,'payment_sessions.pay',requestHash,result,200);await outbox(c,tenantId,'payment.failed','payment_attempt',attemptId,result);return result;}
      const pr=await this.provider.authorize({amountMinor:BigInt(s.amount_minor),currency:s.currency,reference:s.reference||sessionId,idempotencyKey:key,paymentMethodToken:providerToken});
      if(pr.status==='REQUIRES_ACTION'){
        await c.execute("UPDATE payment_attempts SET status='REQUIRES_ACTION',authorization_status='REQUIRES_ACTION',provider_transaction_id=?,external_reference=?,action_required_json=? WHERE id=?",[pr.providerTransactionId,s.reference||sessionId,JSON.stringify(pr.action||{}),attemptId]);
        await c.execute("UPDATE payment_sessions SET status='REQUIRES_ACTION' WHERE id=?",[sessionId]);
        const result={attemptId,status:'REQUIRES_ACTION',providerTransactionId:pr.providerTransactionId,action:pr.action};
        await saveIdempotency(c,tenantId,key,'payment_sessions.pay',requestHash,result,200);
        await outbox(c,tenantId,'payment.action_required','payment_attempt',attemptId,result);
        return result;
      }
      const status=pr.status==='SUCCEEDED'?'SUCCEEDED':'FAILED';
      await c.execute('UPDATE payment_attempts SET status=?,authorization_status=?,capture_status=?,provider_transaction_id=?,failure_code=?,failure_message=? WHERE id=?',[status,status,status==='SUCCEEDED'?'PENDING':null,pr.providerTransactionId,pr.failureCode||null,pr.failureMessage||null,attemptId]);
      if(status==='SUCCEEDED'){
        const capture=await this.provider.capture(pr.providerTransactionId,BigInt(s.amount_minor),key);
        if(capture.status!=='SUCCEEDED'){
          await c.execute("UPDATE payment_attempts SET status='FAILED',capture_status='FAILED',failure_code=?,failure_message=? WHERE id=?",[capture.failureCode||'capture_failed',capture.failureMessage||'Capture failed',attemptId]);
          await c.execute("UPDATE payment_sessions SET status='FAILED' WHERE id=?",[sessionId]);
          const result={attemptId,status:'FAILED',failureCode:capture.failureCode||'capture_failed',failureMessage:capture.failureMessage||'Capture failed'};
          await saveIdempotency(c,tenantId,key,'payment_sessions.pay',requestHash,result,200);
          await outbox(c,tenantId,'payment.failed','payment_attempt',attemptId,result);
          return result;
        }
        await c.execute("UPDATE payment_attempts SET status='SUCCEEDED',capture_status='SUCCEEDED' WHERE id=?",[attemptId]);
      }
      if(status==='SUCCEEDED'){
        const paymentId=uuid();
        await c.execute('INSERT INTO payments(id,tenant_id,merchant_id,customer_id,payment_session_id,payment_attempt_id,provider_id,amount_minor,fee_minor,currency,status,risk_status,provider_transaction_id,payment_method_id,reference,description,capture_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[paymentId,tenantId,s.merchant_id,s.customer_id,sessionId,attemptId,this.provider.name,s.amount_minor,feeMinor.toString(),s.currency,'SUCCEEDED',riskStatus,pr.providerTransactionId,paymentMethodId??null,s.reference,s.description,'CAPTURED']);
        await c.execute('UPDATE payment_sessions SET status=? WHERE id=?',['COMPLETED',sessionId]);
        await this.ledger.postPayment(c,tenantId,paymentId,s.merchant_id,String(s.amount_minor),s.currency,feeMinor.toString());
        const result={paymentId,attemptId,status,providerTransactionId:pr.providerTransactionId};
        await saveIdempotency(c,tenantId,key,'payment_sessions.pay',requestHash,result,200);
        await outbox(c,tenantId,'payment.succeeded','payment',paymentId,result); await audit(c,tenantId,'payment.succeeded','payment',paymentId,null,result);
        return result;
      }
      await c.execute('UPDATE payment_sessions SET status=? WHERE id=?',['FAILED',sessionId]);
      const result={attemptId,status,failureCode:pr.failureCode,failureMessage:pr.failureMessage};
      await saveIdempotency(c,tenantId,key,'payment_sessions.pay',requestHash,result,200);
      await outbox(c,tenantId,'payment.failed','payment_attempt',attemptId,result);
      return result;
    });
  }

  async createPaymentMethodSession(input:any,tenantId:string){
    const [merchant]:any=await pool.query('SELECT id FROM merchants WHERE id=? AND tenant_id=?',[input.merchant_id,tenantId]);
    if(!merchant[0]) throw fail('MERCHANT_NOT_FOUND',404);
    if(input.customer_id){const [customer]:any=await pool.query('SELECT id FROM customers WHERE id=? AND merchant_id=? AND tenant_id=?',[input.customer_id,input.merchant_id,tenantId]);if(!customer[0]) throw fail('CUSTOMER_NOT_FOUND',404);}
    const id=uuid(); const clientSecret=`pm_test_${crypto.randomBytes(24).toString('base64url')}`; const secretHash=crypto.createHash('sha256').update(clientSecret).digest('hex'); const expiresAt=new Date(Date.now()+15*60*1000);
    await pool.query('INSERT INTO payment_method_sessions(id,tenant_id,merchant_id,customer_id,type,provider,client_secret_hash,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',[id,tenantId,input.merchant_id,input.customer_id??null,input.type,this.provider.name,secretHash,'READY',expiresAt]);
    return {id,status:'READY',merchant_id:input.merchant_id,customer_id:input.customer_id??null,type:input.type,client_secret:clientSecret,expires_at:expiresAt,environment:'sandbox',next_action:'collect_provider_token'};
  }

  async confirmPaymentMethodSession(id:string,clientSecret:string,providerToken:string,tenantId:string){
    const secretHash=crypto.createHash('sha256').update(clientSecret).digest('hex');
    const [rows]:any=await pool.query("SELECT * FROM payment_method_sessions WHERE id=? AND tenant_id=? AND client_secret_hash=?",[id,tenantId,secretHash]); const s=rows[0]; if(!s) throw fail('PAYMENT_METHOD_SESSION_NOT_FOUND',404);
    if(s.status!=='READY') throw fail('PAYMENT_METHOD_SESSION_NOT_CONFIRMABLE',409); if(new Date(s.expires_at).getTime()<Date.now()) throw fail('PAYMENT_METHOD_SESSION_EXPIRED',409);
    const token=await this.provider.createPaymentMethod({token:providerToken,type:s.type});
    const pmId=uuid();
    await pool.query('INSERT INTO payment_methods(id,tenant_id,merchant_id,customer_id,type,provider_token,provider_token_encrypted,provider_payment_method_id,brand,last4,exp_month,exp_year,status,tokenization_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[pmId,tenantId,s.merchant_id,s.customer_id,s.type,`vault_${hash(token.providerToken)}`,encryptProviderToken(token.providerToken),hash(token.providerToken),token.brand??null,token.last4??null,token.expMonth??null,token.expYear??null,'ACTIVE','TOKENIZED']);
    await pool.query("UPDATE payment_method_sessions SET status='COMPLETED',provider_token_encrypted=?,provider_payment_method_id=? WHERE id=?",[encryptProviderToken(token.providerToken),token.providerToken,id]);
    return {id:pmId,merchant_id:s.merchant_id,customer_id:s.customer_id,type:s.type,brand:token.brand,last4:token.last4,exp_month:token.expMonth,exp_year:token.expYear,status:'ACTIVE'};
  }

  async createPaymentMethod(input:any,tenantId:string){
    const [customer]:any=await pool.query('SELECT id FROM customers WHERE id=? AND merchant_id=? AND tenant_id=?',[input.customer_id,input.merchant_id,tenantId]); if(!customer[0]) throw fail('CUSTOMER_NOT_FOUND',404);
    const token=await this.provider.createPaymentMethod({token:input.provider_token,type:input.type}); const id=uuid();
    await pool.query('INSERT INTO payment_methods(id,tenant_id,merchant_id,customer_id,type,provider_token,provider_token_encrypted,provider_payment_method_id,brand,last4,exp_month,exp_year,status,tokenization_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,tenantId,input.merchant_id,input.customer_id,input.type,`vault_${hash(token.providerToken)}`,encryptProviderToken(token.providerToken),hash(token.providerToken),token.brand??input.brand??null,token.last4??input.last4??null,token.expMonth??input.exp_month??null,token.expYear??input.exp_year??null,'ACTIVE','TOKENIZED']);
    return {id,merchant_id:input.merchant_id,customer_id:input.customer_id,type:input.type,brand:token.brand??input.brand,last4:token.last4??input.last4,exp_month:token.expMonth??input.exp_month,exp_year:token.expYear??input.exp_year,status:'ACTIVE'};
  }

  async listPaymentMethods(customerId:string,tenantId:string){
    const [rows]:any=await pool.query('SELECT id,merchant_id,customer_id,type,brand,last4,exp_month,exp_year,status,created_at FROM payment_methods WHERE customer_id=? AND tenant_id=? ORDER BY created_at DESC',[customerId,tenantId]);
    return rows;
  }

  async getBalance(merchantId:string,tenantId:string,currency:string){const [rows]:any=await pool.query('SELECT * FROM account_balances WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id=? AND code=?)',[tenantId,`merchant_payable:${merchantId}:${currency}`]);return rows[0]||{ledger_minor:'0',available_minor:'0',pending_minor:'0',reserve_minor:'0',currency};}
}
