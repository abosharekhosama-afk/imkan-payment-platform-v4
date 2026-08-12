/**
 * Point every organization at platform Stripe (SANDBOX) for local checkout card fields.
 * Usage: node scripts/seed-stripe-routes.mjs
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {loadRootDotEnv, resolvePgConnectionString} from './lib/pg-connection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadRootDotEnv(root);

const connectionString = resolvePgConnectionString();

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
