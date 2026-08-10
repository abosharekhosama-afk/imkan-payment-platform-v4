import crypto from 'node:crypto'; import {pool} from '../../infrastructure/db/mysql.js'; import {RemoteRiskProvider} from '../../infrastructure/providers/real-rails.js';
export class RiskService {
 async assess(tenantId:string,input:{paymentAttemptId?:string;paymentId?:string;amountMinor:string|number;currency:string;customerId?:string|null;reference?:string|null}) {
  let score=0; const reasons:string[]=[]; const amount=Number(input.amountMinor);
  if(amount>=100000){score+=30;reasons.push('HIGH_AMOUNT');}
  if((input.reference||'').toUpperCase().includes('RISK')){score+=60;reasons.push('REFERENCE_RISK');}
  if(input.customerId){const [rows]:any=await pool.query("SELECT COUNT(*) count FROM payments WHERE tenant_id=? AND customer_id=? AND created_at>=DATE_SUB(CURRENT_TIMESTAMP(6),INTERVAL 1 HOUR)",[tenantId,input.customerId]);if(Number(rows[0]?.count||0)>=5){score+=35;reasons.push('VELOCITY');}}
  let providerDecision:any=null;
  if(process.env.RISK_PROVIDER_URL){providerDecision=await new RemoteRiskProvider().assess({tenant_id:tenantId,...input,local_score:score,local_reasons:reasons});score=Number(providerDecision.score??score);if(providerDecision.signals)reasons.push(...Object.keys(providerDecision.signals).map(k=>`REMOTE_${k}`));}
  const status=providerDecision?.decision==='BLOCK'?'BLOCKED':providerDecision?.decision==='REVIEW'?'REVIEW':providerDecision?.decision==='ALLOW'?'LOW':score>=80?'BLOCKED':score>=50?'REVIEW':score>=25?'MEDIUM':'LOW'; const id=crypto.randomUUID();
  await pool.query('INSERT INTO risk_assessments(id,tenant_id,payment_attempt_id,payment_id,score,status,reasons_json) VALUES(?,?,?,?,?,?,?)',[id,tenantId,input.paymentAttemptId||null,input.paymentId||null,score,status,JSON.stringify(reasons)]);
  return {id,score,status,reasons,provider:providerDecision?.provider||'rules'};
 }
}
