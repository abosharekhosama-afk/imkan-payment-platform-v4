import pg from 'pg';
import {config} from '../../config.js';

const {Pool} = pg;

export const pgPool = new Pool({
  connectionString: config.postgresUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
});

export type PgClient = pg.PoolClient;

export async function pgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return pgPool.query<T>(text, params);
}

export async function withPgTransaction<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function pgPing(): Promise<boolean> {
  const r = await pgPool.query('SELECT 1 AS ok');
  return r.rows[0]?.ok === 1;
}

export async function closePgPool(): Promise<void> {
  await pgPool.end();
}
