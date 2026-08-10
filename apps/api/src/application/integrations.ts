import crypto from 'node:crypto';
import {pool} from '../infrastructure/db/mysql.js';

export async function emitOutbox(tenantId:string,eventType:string,aggregateType:string,aggregateId:string,payload:any,idempotencyKey:string){
 const eventId=crypto.randomUUID();
 const envelope={event_id:eventId,event_type:eventType,event_version:1,tenant_id:tenantId,aggregate_type:aggregateType,aggregate_id:aggregateId,occurred_at:new Date().toISOString(),idempotency_key:idempotencyKey,payload};
 await pool.query('INSERT INTO integration_outbox(id,tenant_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,status) VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),tenantId,eventId,eventType,aggregateType,aggregateId,JSON.stringify(envelope),'PENDING']);
 await pool.query("INSERT INTO outbox_events(id,tenant_id,event_type,aggregate_type,aggregate_id,payload_json,status) VALUES(?,?,?,?,?,?,?)",[eventId,tenantId,eventType,aggregateType,aggregateId,JSON.stringify(payload),'PENDING']);
 return eventId;
}
