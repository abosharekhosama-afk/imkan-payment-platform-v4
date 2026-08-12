/**
 * Shared PostgreSQL connection helper for CLI scripts.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadRootDotEnv(root) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

export function resolvePgConnectionString() {
  const cs = (process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || '').trim();
  if (cs.includes('postgres')) return cs;
  console.error(`
DATABASE_URL_PG is not set — cannot connect to Neon/PostgreSQL.

Add to .env:
  DATABASE_URL_PG=postgres://USER:PASSWORD@ep-xxx.neon.tech/neondb?sslmode=require

Or in PowerShell:
  $env:DATABASE_URL_PG="postgres://..."
`);
  process.exit(2);
}
