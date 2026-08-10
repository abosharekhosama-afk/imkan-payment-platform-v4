import crypto from 'node:crypto';
import {pool} from './infrastructure/db/mysql.js';

export function hashToken(v:string){return crypto.createHash('sha256').update(v).digest('hex');}
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString('base64url');}
export function hashPassword(password:string){const salt=crypto.randomBytes(16);const derived=crypto.scryptSync(password,salt,64);return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;}
export function verifyPassword(password:string,stored:string){try{const [scheme,saltHex,hashHex]=stored.split('$');if(scheme!=='scrypt')return false;const derived=crypto.scryptSync(password,Buffer.from(saltHex,'hex'),64);return crypto.timingSafeEqual(derived,Buffer.from(hashHex,'hex'));}catch{return false;}}
export async function securityEvent(input:{tenantId?:string|null;userId?:string|null;eventType:string;success?:boolean;ip?:string;userAgent?:string;metadata?:unknown}){await pool.query('INSERT INTO security_events(id,tenant_id,user_id,event_type,success,ip,user_agent,metadata_json) VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),input.tenantId||null,input.userId||null,input.eventType,input.success!==false,input.ip||null,input.userAgent||null,input.metadata?JSON.stringify(input.metadata):null]).catch(()=>undefined);}
export function safeEqual(a:string,b:string){const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y);}
