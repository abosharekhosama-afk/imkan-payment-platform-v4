/**
 * E2E harness only: mark org subscriptions due so renewals/run can create invoices.
 * Mirrors tests/phase6-billing.test.ts (SQL next_billing_at backdate).
 * Does not change production billing business logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const credPath = path.join(root, '.tmp', 'e2e-credentials.json');

const orgId = process.argv[2];
if (!orgId) {
  console.error('Usage: node scripts/e2e-force-subscriptions-due.mjs <organization_id>');
  process.exit(1);
}
if (!fs.existsSync(credPath)) {
  console.error('Missing', credPath);
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
const pool = new pg.Pool({connectionString: creds.connectionString});
const r = await pool.query(
  `UPDATE subscriptions
   SET next_billing_at = NOW() - interval '1 minute', next_retry_at = NULL
   WHERE organization_id = $1
     AND status = ANY(ARRAY['ACTIVE','TRIALING','PAST_DUE','PAUSED'])
   RETURNING id`,
  [orgId],
);
await pool.end();
console.log(JSON.stringify({updated: r.rowCount, ids: r.rows.map((x) => x.id)}));
