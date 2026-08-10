import crypto from 'node:crypto';
import {pool} from '../../infrastructure/db/mysql.js';
import {fail} from './shared.js';
import {PaymentService} from './payment-service.js';

export class PaymentLinkService {
  constructor(private readonly payments:PaymentService){}
  async create(input:any,tenantId:string){
    const [m]:any=await pool.query('SELECT id FROM merchants WHERE id=? AND tenant_id=?',[input.merchant_id,tenantId]); if(!m[0]) throw fail('MERCHANT_NOT_FOUND',404);
    const id=crypto.randomUUID(); const publicToken=crypto.randomBytes(24).toString('base64url');
    await pool.query('INSERT INTO payment_links(id,tenant_id,merchant_id,amount_minor,currency,reference,description,customer_email,customer_phone,expires_at,public_token) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,tenantId,input.merchant_id,input.amount_minor,input.currency,input.reference??null,input.description??null,input.customer_email??null,input.customer_phone??null,input.expires_at?new Date(input.expires_at):null,publicToken]);
    return {id,public_token:publicToken,url:`/checkout/public/${publicToken}`,status:'ACTIVE',...input};
  }
  async get(id:string,tenantId?:string){const [rows]:any=await pool.query(tenantId?'SELECT * FROM payment_links WHERE id=? AND tenant_id=?':'SELECT * FROM payment_links WHERE id=?',tenantId?[id,tenantId]:[id]);if(!rows[0]) throw fail('NOT_FOUND',404);return rows[0];}
  async getPublic(token:string){const [rows]:any=await pool.query('SELECT id,tenant_id,amount_minor,currency,reference,description,status,expires_at,merchant_id,customer_email,customer_phone,public_token FROM payment_links WHERE public_token=?',[token]);const link=rows[0];if(!link) throw fail('PAYMENT_LINK_NOT_FOUND',404);if(link.status!=='ACTIVE') throw fail('PAYMENT_LINK_NOT_ACTIVE',409);if(link.expires_at&&new Date(link.expires_at).getTime()<Date.now()) throw fail('PAYMENT_LINK_EXPIRED',409);return link;}
  async pay(id:string,tenantId:string,key:string){const link=await this.get(id,tenantId);if(link.status!=='ACTIVE') throw fail('LINK_NOT_ACTIVE',409);const session=await this.payments.createSession({merchant_id:link.merchant_id,amount_minor:String(link.amount_minor),currency:link.currency,reference:link.reference,description:link.description},tenantId,`link-session:${id}:${key}`);const payment=await this.payments.pay(session.id,tenantId,undefined,`link-pay:${id}:${key}`);if(payment.status==='SUCCEEDED') await pool.query("UPDATE payment_links SET status='PAID' WHERE id=? AND tenant_id=? AND status='ACTIVE'",[id,tenantId]);return {link_id:id,session,payment};}
}
