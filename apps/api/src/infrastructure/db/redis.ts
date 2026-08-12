// Redis is optional for local Windows development. Production deployments can
// set REDIS_URL to enable a real Redis connection.
import {createClient} from 'redis';

let client: any = null;
let connecting: Promise<any> | null = null;

const REDIS_CONNECT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 2000);

/** Normalize Upstash / copy-paste mistakes (redis-cli snippet, missing TLS). */
export function normalizeRedisUrl(raw: string): string {
  let url = raw.trim();
  const cliMatch = url.match(/redis-cli\s+(?:--tls\s+)?-u\s+(\S+)/i);
  if (cliMatch) url = cliMatch[1];
  if (/upstash\.io/i.test(url) && url.startsWith('redis://')) {
    url = `rediss://${url.slice('redis://'.length)}`;
  }
  return url;
}

function redisClientOptions(url: string) {
  const normalized = normalizeRedisUrl(url);
  return {
    url: normalized,
    socket: {
      connectTimeout: REDIS_CONNECT_MS,
      reconnectStrategy: (retries: number) => {
        if (retries >= 3) return new Error('redis unavailable');
        return Math.min(retries * 200, 500);
      },
    },
  };
}

function resetRedisClient() {
  client = null;
  connecting = null;
}

export async function getRedis(): Promise<any> {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error('REDIS_URL is not configured');
  }

  if (client?.isReady) {
    return client;
  }

  if (!connecting) {
    const c = createClient(redisClientOptions(url));

    c.on('error', (err) => {
      console.error('[redis]', err);
    });

    connecting = c
      .connect()
      .then(() => {
        client = c;
        return c;
      })
      .catch((err) => {
        resetRedisClient();
        throw err;
      });
  }

  return connecting;
}

export async function redisPing(): Promise<'ok' | 'disabled' | 'error'> {
  if (!process.env.REDIS_URL) {
    return 'disabled';
  }

  try {
    const c = createClient(redisClientOptions(process.env.REDIS_URL));
    c.on('error', () => undefined);
    await c.connect();
    await c.ping();
    await c.quit().catch(() => undefined);
    return 'ok';
  } catch {
    resetRedisClient();
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