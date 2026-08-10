import crypto from 'node:crypto';
import type mysql from 'mysql2/promise';

export const uuid=()=>crypto.randomUUID();
export const hash=(v:unknown)=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const fail=(code:string,statusCode:number)=>Object.assign(new Error(code),{statusCode,code});

export async function getIdempotent(c:mysql.PoolConnection|typeof import('../../infrastructure/db/mysql.js').pool,tenantId:string,key:string,requestHash:string){
  const [rows]:any=await c.query('SELECT * FROM idempotency_records WHERE tenant_id=? AND idem_key=? LIMIT 1',[tenantId,key]);
  if(!rows[0]) return null;
  if(rows[0].request_hash!==requestHash) throw fail('IDEMPOTENCY_KEY_REUSED',409);
  return JSON.parse(rows[0].response_json);
}

export async function saveIdempotency(c:mysql.PoolConnection,tenantId:string,key:string,operation:string,requestHash:string,response:any,status:number){
  await c.execute('INSERT INTO idempotency_records(tenant_id,idem_key,operation,request_hash,response_json,status) VALUES(?,?,?,?,?,?)',[tenantId,key,operation,requestHash,JSON.stringify(response),status]);
}

export async function outbox(c:mysql.PoolConnection,tenantId:string,eventType:string,aggregateType:string,aggregateId:string,payload:any){
  await c.execute('INSERT INTO outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,payload_json) VALUES(?,?,?,?,?,?)',[uuid(),tenantId,eventType,aggregateType,aggregateId,JSON.stringify(payload)]);
}

export async function audit(c:mysql.PoolConnection,tenantId:string,action:string,type:string,id:string,before:any,after:any){
  await c.execute('INSERT INTO audit_logs(id,tenant_id,action,resource_type,resource_id,before_json,after_json) VALUES(?,?,?,?,?,?,?)',[uuid(),tenantId,action,type,id,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}
