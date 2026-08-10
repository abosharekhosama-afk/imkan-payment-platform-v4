import {config} from './config.js';
import {WebhookDeliveryWorker} from './application/webhooks/worker.js';
import {SubscriptionRenewalWorker} from './application/billing/worker.js';
import {pool} from './infrastructure/db/mysql.js';
import {closeRedis} from './infrastructure/db/redis.js';
const webhookWorker=new WebhookDeliveryWorker(config.webhookWorkerIntervalMs);
const renewalWorker=new SubscriptionRenewalWorker(config.renewalWorkerIntervalMs);
let stopping=false;
async function shutdown(signal:string){if(stopping)return;stopping=true;console.log(JSON.stringify({level:'info',message:'worker shutdown',signal}));webhookWorker.stop();renewalWorker.stop();await closeRedis().catch(()=>undefined);await pool.end().catch(()=>undefined);process.exit(0);} 
process.once('SIGTERM',()=>void shutdown('SIGTERM'));process.once('SIGINT',()=>void shutdown('SIGINT'));
webhookWorker.start();renewalWorker.start();
console.log(JSON.stringify({level:'info',message:'payment-platform worker started',webhook_interval_ms:config.webhookWorkerIntervalMs,renewal_interval_ms:config.renewalWorkerIntervalMs}));
