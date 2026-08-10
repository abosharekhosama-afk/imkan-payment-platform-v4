import crypto from 'node:crypto';
import {config} from '../../config.js';

function key(){return crypto.createHash('sha256').update(config.paymentTokenEncryptionKey).digest();}
export function encryptProviderToken(value:string){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,ciphertext]).toString('base64url');
}
export function decryptProviderToken(value:string){
  const raw=Buffer.from(value,'base64url');
  const iv=raw.subarray(0,12),tag=raw.subarray(12,28),ciphertext=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
}
