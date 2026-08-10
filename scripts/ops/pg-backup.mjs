#!/usr/bin/env node
/**
 * PostgreSQL logical backup (P15.2).
 * Usage:
 *   node scripts/ops/pg-backup.mjs [--out dir]
 * Env: DATABASE_URL_PG or POSTGRES_URL
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outArgIdx = process.argv.indexOf('--out');
const outDir =
  (outArgIdx >= 0 && process.argv[outArgIdx + 1]) ||
  process.env.BACKUP_OUT_DIR ||
  path.join(root, '.tmp', 'pg-backups');

const connectionString =
  process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!connectionString || !connectionString.includes('postgres')) {
  console.error('DATABASE_URL_PG (PostgreSQL) is required');
  process.exit(2);
}

fs.mkdirSync(outDir, {recursive: true});
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `imkan_payments_${stamp}.sql`);

const client = new pg.Client({connectionString});
await client.connect();

async function dumpTable(table) {
  const cols = await client.query(
    `SELECT column_name, data_type, udt_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  if (!cols.rows.length) return '';
  const colList = cols.rows.map((r) => `"${r.column_name}"`).join(', ');
  const rows = await client.query(`SELECT ${colList} FROM public."${table}"`);
  if (!rows.rows.length) return `-- table ${table}: 0 rows\n`;

  const lines = [`-- table ${table}: ${rows.rows.length} rows`];
  for (const row of rows.rows) {
    const values = cols.rows.map((c) => {
      const v = row[c.column_name];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'number' || typeof v === 'bigint') return String(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (v instanceof Date) return `'${v.toISOString()}'`;
      if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
      if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    lines.push(`INSERT INTO public."${table}" (${colList}) VALUES (${values.join(', ')});`);
  }
  return lines.join('\n') + '\n';
}

const tables = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
);
let sql = `-- IMKAN Payments PostgreSQL backup\n-- Generated: ${new Date().toISOString()}\nBEGIN;\nSET session_replication_role = replica;\n\n`;

for (const t of tables.rows.map((r) => r.tablename)) {
  if (t === 'schema_migrations') continue;
  sql += await dumpTable(t);
}

sql += `\nSET session_replication_role = DEFAULT;\nCOMMIT;\n`;
fs.writeFileSync(outFile, sql, 'utf8');

const meta = {
  generated_at: new Date().toISOString(),
  connection_host: connectionString.replace(/:[^:@/]+@/, ':***@'),
  out_file: outFile,
  table_count: tables.rows.length,
  bytes: Buffer.byteLength(sql),
};
fs.writeFileSync(outFile.replace(/\.sql$/, '.json'), JSON.stringify(meta, null, 2));
await client.end();
console.log(JSON.stringify({ok: true, ...meta}, null, 2));
