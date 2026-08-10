import crypto from 'node:crypto';
import {pool} from '../../infrastructure/db/mysql.js';
import {RemoteSettlementProvider,RemotePayoutProvider} from '../../infrastructure/providers/real-rails.js';
const uuid=()=>crypto.randomUUID();
export class FinancialOperationsService {
  async createSettlement(tenantId:string,merchantId:string,currency:string,periodStart:string,periodEnd:string){
    if(process.env.SETTLEMENT_PROVIDER_URL){
      const items=await new RemoteSettlementProvider().fetchSettlements({tenant_id:tenantId,merchant_id:merchantId,currency,period_start:periodStart,period_end:periodEnd});
      return {status:'IMPORTED',provider:'remote',items};
    }
    if((process.env.PAYMENT_PROVIDER||'sandbox').toLowerCase()!=='sandbox') throw Object.assign(new Error('SETTLEMENT_PROVIDER_ADAPTER_REQUIRED'),{code:'SETTLEMENT_PROVIDER_ADAPTER_REQUIRED',statusCode:409});
    const [payments]:any=await pool.query("SELECT id,amount_minor,fee_minor,currency FROM payments WHERE tenant_id=? AND merchant_id=? AND currency=? AND status='SUCCEEDED' AND DATE(created_at) BETWEEN ? AND ? AND id NOT IN (SELECT payment_id FROM settlement_items WHERE payment_id IS NOT NULL)",[tenantId,merchantId,currency,periodStart,periodEnd]);
    const gross=payments.reduce((n:any,p:any)=>n+BigInt(p.amount_minor),0n); const fees=payments.reduce((n:any,p:any)=>n+BigInt(p.fee_minor||0),0n); const net=gross-fees; const id=uuid();
    await pool.query('INSERT INTO settlements(id,tenant_id,merchant_id,currency,gross_amount_minor,fees_minor,adjustments_minor,net_amount_minor,settlement_date,status,provider_reference) VALUES(?,?,?,?,?,?,?,?,CURRENT_DATE,?,?)',[id,tenantId,merchantId,currency,gross.toString(),fees.toString(),'0',net.toString(),'RECONCILED',`sbx_st_${id.slice(0,12)}`]);
    for(const p of payments) await pool.query('INSERT INTO settlement_items(id,tenant_id,settlement_id,payment_id,amount_minor,fee_minor,currency,match_status) VALUES(?,?,?,?,?,?,?,?)',[uuid(),tenantId,id,p.id,p.amount_minor,p.fee_minor||0,p.currency,'MATCHED']);
    return {id,gross_amount_minor:gross.toString(),fees_minor:fees.toString(),net_amount_minor:net.toString(),status:'RECONCILED',items:payments.length};
  }
  async createPayout(tenantId:string,merchantId:string,bankAccountId:string|undefined,amountMinor:string,currency:string){
    if(process.env.PAYOUT_PROVIDER_URL){
      const result=await new RemotePayoutProvider().createPayout({tenant_id:tenantId,merchant_id:merchantId,bank_account_id:bankAccountId,amount_minor:amountMinor,currency});
      const id=uuid(); await pool.query('INSERT INTO payouts(id,tenant_id,merchant_id,bank_account_id,amount_minor,currency,gross_amount_minor,fees_minor,adjustments_minor,net_amount_minor,status,provider_reference,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6))',[id,tenantId,merchantId,bankAccountId||null,amountMinor,currency,amountMinor,'0','0',amountMinor,result.status,result.providerReference]);
      return {id,status:result.status,amount_minor:amountMinor,currency,provider_reference:result.providerReference};
    }
    if((process.env.PAYMENT_PROVIDER||'sandbox').toLowerCase()!=='sandbox') throw Object.assign(new Error('PAYOUT_RAIL_NOT_CONFIGURED'),{code:'PAYOUT_RAIL_NOT_CONFIGURED',statusCode:409});
    const [bal]:any=await pool.query('SELECT ab.available_minor FROM account_balances ab JOIN ledger_accounts la ON la.id=ab.account_id WHERE la.tenant_id=? AND la.code=?',[tenantId,`merchant_payable:${merchantId}:${currency}`]);
    if(!bal[0]||BigInt(bal[0].available_minor)<BigInt(amountMinor)) throw Object.assign(new Error('INSUFFICIENT_AVAILABLE_BALANCE'),{code:'INSUFFICIENT_AVAILABLE_BALANCE',statusCode:409});
    const id=uuid(); await pool.query('INSERT INTO payouts(id,tenant_id,merchant_id,bank_account_id,amount_minor,currency,gross_amount_minor,fees_minor,adjustments_minor,net_amount_minor,status,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6))',[id,tenantId,merchantId,bankAccountId||null,amountMinor,currency,amountMinor,'0','0',amountMinor,'PROCESSING']);
    await pool.query('INSERT INTO payout_attempts(id,tenant_id,payout_id,attempt,status,provider_reference,response_json) VALUES(?,?,?,?,?,?,?)',[uuid(),tenantId,id,1,'SUCCEEDED',`sbx_po_${id.slice(0,12)}`,JSON.stringify({provider:'sandbox'})]);
    await pool.query("UPDATE payouts SET status='PAID',processed_at=CURRENT_TIMESTAMP(6),provider_reference=? WHERE id=?",[`sbx_po_${id.slice(0,12)}`,id]);
    await pool.query('UPDATE account_balances ab JOIN ledger_accounts la ON la.id=ab.account_id SET ab.available_minor=ab.available_minor-?,ab.ledger_minor=ab.ledger_minor-? WHERE la.tenant_id=? AND la.code=?',[amountMinor,amountMinor,tenantId,`merchant_payable:${merchantId}:${currency}`]);
    return {id,status:'PAID',amount_minor:amountMinor,currency,provider_reference:`sbx_po_${id.slice(0,12)}`};
  }
  async reconcile(tenantId:string,provider:string,start:string,end:string){
    if((process.env.PAYMENT_PROVIDER||'sandbox').toLowerCase()!=='sandbox') throw Object.assign(new Error('RECONCILIATION_PROVIDER_ADAPTER_REQUIRED'),{code:'RECONCILIATION_PROVIDER_ADAPTER_REQUIRED',statusCode:409});
    const runId=uuid(); await pool.query('INSERT INTO reconciliation_runs(id,tenant_id,provider,period_start,period_end,status) VALUES(?,?,?,?,?,?)',[runId,tenantId,provider,start,end,'RUNNING']);
    const [payments]:any=await pool.query("SELECT id,amount_minor,currency FROM payments WHERE tenant_id=? AND status='SUCCEEDED' AND DATE(created_at) BETWEEN ? AND ?",[tenantId,start,end]);
    const [items]:any=await pool.query('SELECT si.payment_id,si.amount_minor,si.currency FROM settlement_items si JOIN settlements s ON s.id=si.settlement_id WHERE si.tenant_id=? AND s.settlement_date BETWEEN ? AND ?',[tenantId,start,end]);
    const settled=new Map(items.filter((x:any)=>x.payment_id).map((x:any)=>[x.payment_id,String(x.amount_minor)])); let matched=0,exceptions=0;
    for(const p of payments){if(settled.get(p.id)===String(p.amount_minor)) matched++; else {exceptions++;await pool.query('INSERT INTO reconciliation_exceptions(id,tenant_id,run_id,exception_type,source_type,source_id,expected_minor,actual_minor,difference_minor,currency,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[uuid(),tenantId,runId,settled.has(p.id)?'AMOUNT_MISMATCH':'MISSING_SETTLEMENT','PAYMENT',p.id,p.amount_minor,settled.get(p.id)||'0',String(BigInt(p.amount_minor)-BigInt(String(settled.get(p.id)||'0'))),p.currency,'OPEN']);}}
    await pool.query('UPDATE reconciliation_runs SET status=?,matched_count=?,exception_count=?,completed_at=CURRENT_TIMESTAMP(6) WHERE id=?',['COMPLETED',matched,exceptions,runId]); return {id:runId,status:'COMPLETED',matched_count:matched,exception_count:exceptions};
  }
}
