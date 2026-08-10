import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pgPool} from '../infrastructure/db/postgres.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../../../database/migrations/postgres');

async function ensureMigrationsTable() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      migration TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(): Promise<Set<string>> {
  const r = await pgPool.query<{migration: string}>('SELECT migration FROM schema_migrations');
  return new Set(r.rows.map((row) => row.migration));
}

async function main() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`PostgreSQL migrations directory not found: ${migrationsDir}`);
  }
  await ensureMigrationsTable();
  const applied = await appliedSet();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(migration) VALUES($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`failed ${file}`, error);
      throw error;
    } finally {
      client.release();
    }
  }
  await pgPool.end();
  console.log('PostgreSQL migrations complete');
}

main().catch(async (error) => {
  console.error(error);
  await pgPool.end().catch(() => undefined);
  process.exit(1);
});
