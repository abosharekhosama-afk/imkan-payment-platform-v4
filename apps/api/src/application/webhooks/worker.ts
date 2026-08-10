import crypto from 'node:crypto';
import {pool} from '../../infrastructure/db/mysql.js';

const parseJson=(value:any)=>typeof value==='string'?JSON.parse(value):value;
const backoffSeconds=(attempt:number)=>Math.min(3600,Math.pow(2,Math.max(0,attempt-1))*5);

export class WebhookDeliveryWorker {
  private timer:ReturnType<typeof setInterval>|null=null;
  private running=false;
  constructor(private readonly intervalMs=2000){}
  start(){if(this.timer)return;this.timer=setInterval(()=>{void this.processOnce().catch(()=>undefined)},this.intervalMs);void this.processOnce().catch(()=>undefined);}
  stop(){if(this.timer){clearInterval(this.timer);this.timer=null;}}
  async processOnce(){if(this.running)return;this.running=true;try{await this.enqueuePendingEvents();await this.deliverPending();}finally{this.running=false;}}
  private async enqueuePendingEvents(){
    const [events]:any=await pool.query("SELECT * FROM outbox_events WHERE status='PENDING' ORDER BY created_at ASC LIMIT 25");
    for(const event of events){
      const [endpoints]:any=await pool.query("SELECT id,subscribed_events FROM webhook_endpoints WHERE tenant_id=? AND status='ACTIVE'",[event.tenant_id]);
      const subscribed=endpoints.filter((e:any)=>{try{const list=parseJson(e.subscribed_events||[]);return Array.isArray(list)&&(list.includes('*')||list.includes(event.event_type))}catch{return false;}});
      for(const endpoint of subscribed){await pool.query("INSERT IGNORE INTO webhook_deliveries(id,tenant_id,endpoint_id,event_id,status,next_retry_at) VALUES(?,?,?,?, 'PENDING', CURRENT_TIMESTAMP(6))",[crypto.randomUUID(),event.tenant_id,endpoint.id,event.id]);}
      if(!subscribed.length) await pool.query("UPDATE outbox_events SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP(6) WHERE id=? AND status='PENDING'",[event.id]);
    }
  }
  private async deliverPending(){
    const [rows]:any=await pool.query("SELECT d.*,e.event_type,e.aggregate_type,e.aggregate_id,e.payload_json,w.url,w.secret FROM webhook_deliveries d JOIN outbox_events e ON e.id=d.event_id JOIN webhook_endpoints w ON w.id=d.endpoint_id WHERE d.status IN ('PENDING','RETRYING') AND w.status='ACTIVE' AND (d.next_retry_at IS NULL OR d.next_retry_at<=CURRENT_TIMESTAMP(6)) ORDER BY d.created_at ASC LIMIT 25");
    for(const d of rows) await this.deliverOne(d);
  }
  private async deliverOne(d:any){
    const payload=JSON.stringify({id:d.event_id,type:d.event_type,aggregate_type:d.aggregate_type,aggregate_id:d.aggregate_id,data:parseJson(d.payload_json)});
    const signature=crypto.createHmac('sha256',d.secret).update(payload).digest('hex');
    const attempt=Number(d.attempt||0)+1;let responseCode:number|undefined;let responseBody='';let errorMessage:string|undefined;
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
      const response=await fetch(d.url,{method:'POST',headers:{'content-type':'application/json','user-agent':'PaymentPlatform-Webhooks/2.0','x-webhook-id':d.event_id,'x-webhook-signature':`sha256=${signature}`},body:payload,signal:controller.signal});
      clearTimeout(timer);responseCode=response.status;responseBody=(await response.text()).slice(0,4000);
      if(response.ok){await pool.query("UPDATE webhook_deliveries SET attempt=?,status='DELIVERED',response_code=?,delivered_at=CURRENT_TIMESTAMP(6),next_retry_at=NULL WHERE id=?",[attempt,responseCode,d.id]);await pool.query('INSERT INTO webhook_delivery_attempts(id,delivery_id,attempt,response_code,response_body) VALUES(?,?,?,?,?)',[crypto.randomUUID(),d.id,attempt,responseCode,responseBody]);await this.maybePublish(d.event_id);return;}
      errorMessage=`HTTP_${response.status}`;
    }catch(e:any){errorMessage=e?.message||'DELIVERY_FAILED';}
    const next=new Date(Date.now()+backoffSeconds(attempt)*1000);const status=attempt>=10?'FAILED':'RETRYING';
    await pool.query("UPDATE webhook_deliveries SET attempt=?,status=?,response_code=?,next_retry_at=? WHERE id=?",[attempt,status,responseCode??null,status==='FAILED'?null:next,d.id]);
    await pool.query('INSERT INTO webhook_delivery_attempts(id,delivery_id,attempt,response_code,response_body,error_message) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),d.id,attempt,responseCode??null,responseBody,errorMessage]);await this.maybePublish(d.event_id);
  }
  private async maybePublish(eventId:string){const [rows]:any=await pool.query("SELECT COUNT(*) total,SUM(status='DELIVERED') delivered,SUM(status IN ('PENDING','RETRYING')) pending,SUM(status='FAILED') failed FROM webhook_deliveries WHERE event_id=?",[eventId]);const r=rows[0];if(Number(r.total)>0&&Number(r.pending)===0&&Number(r.delivered)+Number(r.failed)===Number(r.total))await pool.query("UPDATE outbox_events SET status='PUBLISHED',published_at=CURRENT_TIMESTAMP(6) WHERE id=? AND status='PENDING'",[eventId]);}
}
