// Redis is optional for local Windows development. Production deployments can
// set REDIS_URL to enable a real Redis connection.
import { createClient } from 'redis';

let client: any = null;
let connecting: Promise<any> | null = null;

export async function getRedis(): Promise<any> {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  if (client?.isReady) {
    return client;
  }

  if (!connecting) {
    const c = createClient({ url });

    c.on('error', (err) => {
      console.error('[redis]', err);
    });

    connecting = c.connect().then(() => {
      client = c;
      return c;
    });
  }

  return connecting;
}

export async function redisPing(): Promise<'ok' | 'disabled' | 'error'> {
  if (!process.env.REDIS_URL) {
    return 'disabled';
  }

  try {
    const c = await getRedis();
    await c.ping();
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function closeRedis() {
  if (client?.isOpen) {
    await client.quit();
  }

  client = null;
  connecting = null;
}