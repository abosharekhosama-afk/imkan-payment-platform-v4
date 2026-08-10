import crypto from 'node:crypto';
import type mysql from 'mysql2/promise';

const uuid=()=>crypto.randomUUID();

export class LedgerService {
  async postPayment(c:mysql.PoolConnection, tenantId:string, paymentId:string, merchantId:string, amount:string, currency:string, fee:string='0'){
    const merchantCode=`merchant_payable:${merchantId}:${currency}`;
    const processorCode=`processor_receivable:${merchantId}:${currency}`;
    const merchant=await this.ensureAccount(c,tenantId,merchantCode,'Merchant Payable','LIABILITY',currency);
    const processor=await this.ensureAccount(c,tenantId,processorCode,'Processor Receivable','ASSET',currency);
    const feeAccount=await this.ensureAccount(c,tenantId,`platform_fee_revenue:${currency}`,'Platform Fee Revenue','REVENUE',currency);
    const net=(BigInt(amount)-BigInt(fee||'0')).toString();
    const txId=uuid();
    await c.execute('INSERT INTO ledger_transactions(id,tenant_id,reference,source_type,source_id,currency,status) VALUES(?,?,?,?,?,?,?)',[txId,tenantId,`payment:${paymentId}`,'PAYMENT',paymentId,currency,'POSTED']);
    if(BigInt(fee||'0')>0n){await c.execute('INSERT INTO ledger_entries(id,transaction_id,account_id,side,amount_minor,currency) VALUES(?,?,?,?,?,?),(?,?,?,?,?,?),(?,?,?,?,?,?)',[uuid(),txId,processor,'DEBIT',amount,currency,uuid(),txId,merchant,'CREDIT',net,currency,uuid(),txId,feeAccount,'CREDIT',fee,currency]);} else {await c.execute('INSERT INTO ledger_entries(id,transaction_id,account_id,side,amount_minor,currency) VALUES(?,?,?,?,?,?),(?,?,?,?,?,?)',[uuid(),txId,processor,'DEBIT',amount,currency,uuid(),txId,merchant,'CREDIT',amount,currency]);}
    await c.execute('INSERT INTO financial_postings(id,tenant_id,source_type,source_id,ledger_transaction_id) VALUES(?,?,?,?,?)',[uuid(),tenantId,'PAYMENT',paymentId,txId]);
    await c.execute('INSERT INTO account_balances(account_id,ledger_minor,available_minor,pending_minor,reserve_minor) VALUES(?,?,?,?,0) ON DUPLICATE KEY UPDATE ledger_minor=ledger_minor+VALUES(ledger_minor),available_minor=available_minor+VALUES(available_minor)',[merchant,net,net,0]);
    return txId;
  }

  async postRefund(c:mysql.PoolConnection, tenantId:string, refundId:string, merchantId:string, amount:string, currency:string){
    const merchantCode=`merchant_payable:${merchantId}:${currency}`;
    const processorCode=`processor_receivable:${merchantId}:${currency}`;
    const merchant=await this.ensureAccount(c,tenantId,merchantCode,'Merchant Payable','LIABILITY',currency);
    const processor=await this.ensureAccount(c,tenantId,processorCode,'Processor Receivable','ASSET',currency);
    const txId=uuid();
    await c.execute('INSERT INTO ledger_transactions(id,tenant_id,reference,source_type,source_id,currency,status) VALUES(?,?,?,?,?,?,?)',[txId,tenantId,`refund:${refundId}`,'REFUND',refundId,currency,'POSTED']);
    await c.execute('INSERT INTO ledger_entries(id,transaction_id,account_id,side,amount_minor,currency) VALUES(?,?,?,?,?,?),(?,?,?,?,?,?)',[uuid(),txId,merchant,'DEBIT',amount,currency,uuid(),txId,processor,'CREDIT',amount,currency]);
    await c.execute('INSERT INTO financial_postings(id,tenant_id,source_type,source_id,ledger_transaction_id) VALUES(?,?,?,?,?)',[uuid(),tenantId,'REFUND',refundId,txId]);
    await c.execute('UPDATE account_balances SET ledger_minor=ledger_minor-?,available_minor=available_minor-? WHERE account_id=?',[amount,amount,merchant]);
    return txId;
  }

  private async ensureAccount(c:mysql.PoolConnection,tenantId:string,code:string,name:string,type:string,currency:string){
    await c.execute('INSERT IGNORE INTO ledger_accounts(id,tenant_id,code,name,type,currency,status) VALUES(?,?,?,?,?,?,?)',[uuid(),tenantId,code,name,type,currency,'ACTIVE']);
    const [rows]:any=await c.execute('SELECT id FROM ledger_accounts WHERE tenant_id=? AND code=?',[tenantId,code]);
    await c.execute('INSERT IGNORE INTO account_balances(account_id) VALUES(?)',[rows[0].id]);
    return rows[0].id as string;
  }
}
