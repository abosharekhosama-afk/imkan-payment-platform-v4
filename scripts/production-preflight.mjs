#!/usr/bin/env node
/**
 * Production preflight — validates env, PostgreSQL, Redis, SMTP, Stripe before deploy.
 *
 * Usage:
 *   npm run ops:production-preflight
 *   node scripts/production-preflight.mjs --env .env.production
 *
 * Loads .env by default; use --env to point at another file.
 * Does not print secret values.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {createClient} from 'redis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const envArgIdx = process.argv.indexOf('--env');
const envFile =
  (envArgIdx >= 0 && process.argv[envArgIdx + 1]) ||
  (fs.existsSync(path.join(root, '.env.production'))
    ? path.join(root, '.env.production')
    : path.join(root, '.env'));

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv(envFile);

const DEV_MARKERS = ['dev-only', 'dev-webhook', 'REPLACE_ME', 'CHANGE_ME', 'placeholder'];

const checks = [];

function add(id, label, ok, detail, warn = false) {
  checks.push({id, label, status: ok ? 'pass' : warn ? 'warn' : 'fail', detail});
}

function env(name) {
  return (process.env[name] || '').trim();
}

function isDevSecret(value) {
  const v = value.toLowerCase();
  return !v || DEV_MARKERS.some((m) => v.includes(m.toLowerCase()));
}

function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

// --- 1. Core production flags ---
add('node_env', 'NODE_ENV=production', env('NODE_ENV') === 'production');
add('trust_proxy', 'TRUST_PROXY=true', env('TRUST_PROXY').toLowerCase() === 'true');
add(
  'cors',
  'CORS_ORIGIN is HTTPS (no wildcard)',
  isHttpsUrl(env('CORS_ORIGIN')) && !env('CORS_ORIGIN').includes('*'),
);
add(
  'app_public_url',
  'APP_PUBLIC_URL is HTTPS',
  isHttpsUrl(env('APP_PUBLIC_URL') || env('CHECKOUT_BASE_URL')),
);

// --- 2. PostgreSQL ---
const pgUrl = env('DATABASE_URL_PG') || env('POSTGRES_URL');
add('pg_url', 'DATABASE_URL_PG configured', Boolean(pgUrl && pgUrl.includes('postgres')));

// --- 3. Redis ---
add('redis_url', 'REDIS_URL configured', Boolean(env('REDIS_URL')));
add('rate_limit_store', 'RATE_LIMIT_STORE=redis', env('RATE_LIMIT_STORE').toLowerCase() === 'redis');

// --- 4. Sessions / workers ---
add(
  'session_transport',
  'SESSION_TRANSPORT=cookie (or dual)',
  ['cookie', 'dual'].includes(env('SESSION_TRANSPORT').toLowerCase() || 'cookie'),
);
add(
  'outbox_worker',
  'OUTBOX_WORKER_ENABLED=true',
  env('OUTBOX_WORKER_ENABLED').toLowerCase() !== 'false',
);

// --- 5. Email ---
add('email_transport', 'EMAIL_TRANSPORT=smtp', env('EMAIL_TRANSPORT').toLowerCase() === 'smtp');
add('smtp_host', 'SMTP_HOST set', Boolean(env('SMTP_HOST')));
add('email_from', 'EMAIL_FROM set', Boolean(env('EMAIL_FROM')));
add(
  'email_verification',
  'REQUIRE_EMAIL_VERIFICATION=true (default in production)',
  env('REQUIRE_EMAIL_VERIFICATION') !== 'false',
);

// --- 6. KYB ---
add(
  'kyb_gate',
  'REQUIRE_KYB_FOR_PAYMENTS=true (default in production)',
  env('REQUIRE_KYB_FOR_PAYMENTS') !== 'false',
);

// --- 7. Payment provider ---
add('payment_provider', 'PAYMENT_PROVIDER=stripe', env('PAYMENT_PROVIDER').toLowerCase() === 'stripe');

// --- 8. Stripe Live ---
add('stripe_allow_live', 'STRIPE_ALLOW_LIVE=true', env('STRIPE_ALLOW_LIVE').toLowerCase() === 'true');
add('stripe_env', 'STRIPE_ENV=live', ['live', 'production', 'prod'].includes(env('STRIPE_ENV').toLowerCase()));
add('stripe_adapter', 'STRIPE_ADAPTER_MODE=http', env('STRIPE_ADAPTER_MODE').toLowerCase() === 'http');
add(
  'stripe_live_sk',
  'STRIPE_LIVE_SECRET_KEY (sk_live_…)',
  env('STRIPE_LIVE_SECRET_KEY').startsWith('sk_live_') && !isDevSecret(env('STRIPE_LIVE_SECRET_KEY')),
);
add(
  'stripe_live_pk',
  'STRIPE_LIVE_PUBLISHABLE_KEY (pk_live_…)',
  env('STRIPE_LIVE_PUBLISHABLE_KEY').startsWith('pk_live_'),
);
add(
  'stripe_live_wh',
  'STRIPE_LIVE_WEBHOOK_SECRET (whsec_…)',
  env('STRIPE_LIVE_WEBHOOK_SECRET').startsWith('whsec_') && !isDevSecret(env('STRIPE_LIVE_WEBHOOK_SECRET')),
);
add(
  'stripe_return_urls',
  'STRIPE success/cancel URLs use HTTPS',
  isHttpsUrl(env('STRIPE_SUCCESS_URL')) && isHttpsUrl(env('STRIPE_CANCEL_URL')),
);

// --- 9. Production secrets ---
for (const key of [
  'WEBHOOK_SIGNING_SECRET',
  'PAYMENT_TOKEN_ENCRYPTION_KEY',
  'BANK_DATA_ENCRYPTION_KEY',
  'BANK_FINGERPRINT_HMAC_KEY',
]) {
  add(`secret_${key}`, `${key} is not a dev placeholder`, !isDevSecret(env(key)));
}

// --- Live connectivity ---
if (pgUrl && pgUrl.includes('postgres')) {
  try {
    const client = new pg.Client({
      connectionString: pgUrl,
      connectionTimeoutMillis: 8000,
    });
    await client.connect();
    const r = await client.query('SELECT 1 AS ok');
    await client.end();
    add('pg_ping', 'PostgreSQL reachable', r.rows[0]?.ok === 1);
  } catch (e) {
    add('pg_ping', 'PostgreSQL reachable', false, e.message);
  }
} else {
  add('pg_ping', 'PostgreSQL reachable', false, 'skipped — no URL');
}

if (env('REDIS_URL')) {
  try {
    const c = createClient({
      url: env('REDIS_URL'),
      socket: {connectTimeout: 5000, reconnectStrategy: () => new Error('redis preflight')},
    });
    c.on('error', () => undefined);
    await c.connect();
    const pong = await c.ping();
    await c.quit().catch(() => undefined);
    add('redis_ping', 'Redis reachable', pong === 'PONG');
  } catch (e) {
    add('redis_ping', 'Redis reachable', false, e.message);
  }
} else {
  add('redis_ping', 'Redis reachable', false, 'skipped — no REDIS_URL');
}

// Stripe preflight via tsx (source is TypeScript)
try {
  const {spawnSync} = await import('node:child_process');
  const r = spawnSync('npx', ['tsx', 'scripts/stripe-preflight.ts'], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const liveReady = /liveReady=true/.test(out);
  add('stripe_preflight', 'Stripe preflight liveReady', liveReady, liveReady ? undefined : 'Run npm run stripe:preflight for details');
} catch (e) {
  add('stripe_preflight', 'Stripe preflight', false, e.message, true);
}

// --- Web build reminder ---
const webProdEnv = path.join(root, 'apps', 'web', '.env.production');
add(
  'web_env',
  'apps/web/.env.production exists (VITE_API_URL + VITE_SESSION_TRANSPORT=cookie)',
  fs.existsSync(webProdEnv),
  fs.existsSync(webProdEnv) ? undefined : 'Copy apps/web/.env.production.example → .env.production',
);

// --- Summary ---
const fails = checks.filter((c) => c.status === 'fail');
const warns = checks.filter((c) => c.status === 'warn');
const passes = checks.filter((c) => c.status === 'pass');

console.log('\n=== Production Preflight ===');
console.log(`Env file: ${envFile}`);
console.log(`Pass: ${passes.length}  Warn: ${warns.length}  Fail: ${fails.length}\n`);

for (const c of checks) {
  const icon = c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗';
  console.log(`  ${icon} ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
}

console.log('\nNext steps when all pass:');
console.log('  1. npm run db:migrate:pg');
console.log('  2. npm run seed:platform-owner');
console.log('  3. npm run seed:stripe-routes');
console.log('  4. npm run build:web:production');
console.log('  5. Deploy API + static web; configure Stripe webhook URL');
console.log('  6. npm run ops:pg-backup (schedule daily)');
console.log('  See docs/ops/PRODUCTION_DEPLOY_RUNBOOK.md\n');

process.exit(fails.length ? 1 : 0);
