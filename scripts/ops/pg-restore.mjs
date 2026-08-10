#!/usr/bin/env node
/**
 * PostgreSQL restore from logical SQL dump (P15.2).
 * Usage:
 *   node scripts/ops/pg-restore.mjs --file path/to/backup.sql [--wipe]
 * Env: DATABASE_URL_PG
 *
 * --wipe truncates all public data tables (keeps schema_migrations) before restore.
 */
import fs from 'node:fs';
import pg from 'pg';

const fileIdx = process.argv.indexOf('--file');
const file = fileIdx >= 0 ? process.argv[fileIdx + 1] : process.env.BACKUP_FILE;
const wipe = process.argv.includes('--wipe') || process.env.BACKUP_WIPE === 'true';
if (!file || !fs.existsSync(file)) {
  console.error('--file <backup.sql> is required');
  process.exit(2);
}

const connectionString =
  process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString || !connectionString.includes('postgres')) {
  console.error('DATABASE_URL_PG (PostgreSQL) is required');
  process.exit(2);
}

const sql = fs.readFileSync(file, 'utf8');
const client = new pg.Client({connectionString});
await client.connect();
try {
  if (wipe) {
    const tables = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations'`,
    );
    const list = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
    if (list) {
      await client.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
  }
  await client.query(sql);
  console.log(JSON.stringify({ok: true, file, wipe, bytes: Buffer.byteLength(sql)}, null, 2));
} finally {
  await client.end();
}
