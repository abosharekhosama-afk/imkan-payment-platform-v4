/**
 * Point every organization at platform Stripe (SANDBOX) for local checkout card fields.
 * Usage: node scripts/seed-stripe-routes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
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

loadDotEnv();

const connectionString =
  process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || 'postgres://imkan:imkan@127.0.0.1:5432/imkan_payments';

const pool = new pg.Pool({connectionString});

const acc = await pool.query(
  `SELECT pa.id
   FROM provider_accounts pa
   JOIN providers p ON p.id = pa.provider_id
   WHERE p.code = 'stripe' AND pa.organization_id IS NULL AND pa.environment = 'SANDBOX'
   LIMIT 1`,
);

if (!acc.rows[0]?.id) {
  console.error('Platform Stripe SANDBOX account missing. Run: npm run db:migrate:pg');
  process.exit(1);
}

const stripeAccountId = acc.rows[0].id;
const orgs = await pool.query(`SELECT id, name FROM organizations ORDER BY created_at`);
let seeded = 0;

for (const org of orgs.rows) {
  await pool.query(`DELETE FROM provider_routes WHERE organization_id = $1 AND environment = 'SANDBOX'`, [org.id]);
  await pool.query(
    `INSERT INTO provider_routes (organization_id, environment, provider_account_id, priority, is_active)
     VALUES ($1, 'SANDBOX', $2, 10, TRUE)`,
    [org.id, stripeAccountId],
  );
  seeded += 1;
  console.log(`Stripe route -> ${org.name || org.id}`);
}

console.log(`Done. Seeded ${seeded} organization(s). Restart API and create a new payment link.`);
await pool.end();
