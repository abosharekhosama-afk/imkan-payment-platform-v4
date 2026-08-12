/**
 * Production prep: migrate PG, seed Stripe routes, run Stripe preflight.
 * Usage: node scripts/prepare-stripe-production.mjs
 */
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(label, cmd, args, env = process.env) {
  console.log(`\n==> ${label}`);
  const r = spawnSync(cmd, args, {cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32'});
  if (r.status !== 0) {
    console.error(`Failed: ${label}`);
    process.exit(r.status ?? 1);
  }
}

run('PostgreSQL migrations', 'npm', ['run', 'db:migrate:pg']);
run('Seed Stripe routes for all organizations', 'node', ['scripts/seed-stripe-routes.mjs']);
run('Stripe preflight', 'npm', ['run', 'stripe:preflight']);

console.log('\nStripe production prep complete.');
console.log('Next: set live keys in .env, configure Stripe webhook, deploy API + web.');
console.log('See docs/ops/STRIPE_PRODUCTION_DEPLOY.md');
