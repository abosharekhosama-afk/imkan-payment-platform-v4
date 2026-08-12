/**
 * Boot embedded PostgreSQL + V4 API for Playwright browser verification.
 * Does not start Phase 7. Does not touch MySQL schemas.
 */
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const embeddedEntry = path.join(root, 'apps', 'api', 'node_modules', 'embedded-postgres', 'dist', 'index.js');
const {default: EmbeddedPostgres} = await import(pathToFileURL(embeddedEntry).href);

const port = Number(process.env.E2E_PG_PORT || 55433);
const apiPort = Number(process.env.E2E_API_PORT || 3000);
const user = 'imkan';
const password = 'imkan';
const database = 'imkan_payments';
const dataDir = path.join(root, '.tmp', 'e2e-pg-16');
const credPath = path.join(root, '.tmp', 'e2e-credentials.json');
const pidPath = path.join(root, '.tmp', 'e2e-api.pid');

const OWNER_EMAIL = process.env.V4_E2E_EMAIL || 'e2e-owner@example.test';
const VIEWER_EMAIL = process.env.V4_E2E_VIEWER_EMAIL || 'e2e-viewer@example.test';
const PASSWORD = process.env.V4_E2E_PASSWORD || 'SecurePass!123';

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

fs.mkdirSync(path.join(root, '.tmp'), {recursive: true});
if (fs.existsSync(dataDir)) fs.rmSync(dataDir, {recursive: true, force: true});
fs.mkdirSync(dataDir, {recursive: true});

const pgEmbedded = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: false,
  onLog: () => undefined,
  onError: (m) => console.error('[e2e-pg]', m),
  initdbFlags: ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C'],
});

const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;

console.log('Starting embedded PostgreSQL for E2E...');
await pgEmbedded.initialise();
await pgEmbedded.start();
await pgEmbedded.createDatabase(database);

const env = {
  ...process.env,
  DATABASE_URL_PG: connectionString,
  POSTGRES_URL: connectionString,
  PORT: String(apiPort),
  ENABLE_LEGACY_V1: 'false',
  REQUIRE_EMAIL_VERIFICATION: 'false',
  EXPOSE_DEV_TOKENS: 'true',
  CORS_ORIGIN: 'http://127.0.0.1:5173,http://localhost:5173',
  NODE_ENV: 'development',
  OUTBOX_WORKER_ENABLED: 'true',
  BILLING_RENEWAL_WORKER_ENABLED: 'false',
  // Browser E2E issues many authenticated requests; avoid 429 clearing the session probe.
  RATE_LIMIT_MAX: '10000',
  RATE_LIMIT_WINDOW: '1 minute',
  STRIPE_ADAPTER_MODE: process.env.STRIPE_ADAPTER_MODE || 'http',
  STRIPE_CHECKOUT_UI: process.env.STRIPE_CHECKOUT_UI || 'elements',
  STRIPE_TEST_SECRET_KEY: process.env.STRIPE_TEST_SECRET_KEY || '',
  STRIPE_TEST_PUBLISHABLE_KEY: process.env.STRIPE_TEST_PUBLISHABLE_KEY || '',
  STRIPE_TEST_WEBHOOK_SECRET: process.env.STRIPE_TEST_WEBHOOK_SECRET || '',
  STRIPE_SUCCESS_URL: process.env.STRIPE_SUCCESS_URL || 'http://127.0.0.1:5173/checkout/return?status=success',
  STRIPE_CANCEL_URL: process.env.STRIPE_CANCEL_URL || 'http://127.0.0.1:5173/checkout/return?status=cancel',
};

console.log('Migrating PostgreSQL...');
const migrate = spawnSync('npm', ['run', 'db:migrate:pg'], {cwd: root, env, encoding: 'utf8', shell: true});
if (migrate.status !== 0) {
  console.error(migrate.stdout, migrate.stderr);
  throw new Error('migrate failed');
}

console.log('Starting API...');
const api = spawn('npx', ['tsx', 'src/server.ts'], {
  cwd: path.join(root, 'apps', 'api'),
  env,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
fs.writeFileSync(pidPath, String(api.pid || ''));
api.stdout.on('data', (d) => process.stdout.write(d));
api.stderr.on('data', (d) => process.stderr.write(d));

async function waitHealth(ms = 90_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API health timeout');
}

await waitHealth();
console.log('API healthy');

async function register(email, orgName) {
  const reg = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/register`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password: PASSWORD, organization_name: orgName, name: email.split('@')[0]}),
  });
  const body = await reg.json();
  if (!reg.ok) throw new Error(`register failed ${reg.status} ${JSON.stringify(body)}`);
  const token = body.data?.email_verification_token;
  if (token) {
    await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token}),
    });
  }
  const login = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password: PASSWORD}),
  });
  const loginBody = await login.json();
  if (!login.ok) throw new Error(`login failed ${login.status} ${JSON.stringify(loginBody)}`);
  return {
    email,
    password: PASSWORD,
    access_token: loginBody.data.access_token,
    organization_id: body.data.organization_id,
    user_id: body.data.user_id,
  };
}

const owner = await register(OWNER_EMAIL, 'E2E Owner Org');
const viewer = await register(VIEWER_EMAIL, 'E2E Viewer Org');

const MERCHANT_ROLES = [
  'MERCHANT_ADMIN',
  'MERCHANT_FINANCE',
  'MERCHANT_DEVELOPER',
  'MERCHANT_SUPPORT',
  'MERCHANT_VIEWER',
];
const PLATFORM_ROLES = ['PLATFORM_OWNER', 'PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE'];

const pool = new pg.Pool({connectionString});

async function setMerchantRole(userId, roleCode) {
  await pool.query(
    `UPDATE user_roles ur
     SET role_id = (SELECT id FROM roles WHERE code=$2 AND organization_id IS NULL AND scope='MERCHANT')
     WHERE ur.user_id=$1 AND ur.organization_id IS NOT NULL`,
    [userId, roleCode],
  );
}

async function login(email) {
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password: PASSWORD}),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`login ${email} failed ${res.status}`);
  return body.data.access_token;
}

await setMerchantRole(viewer.user_id, 'MERCHANT_VIEWER');
viewer.access_token = await login(VIEWER_EMAIL);

async function seedStripeRoutesForOrg(orgId) {
  if (!orgId) return;
  const acc = await pool.query(
    `SELECT pa.id
     FROM provider_accounts pa
     JOIN providers p ON p.id = pa.provider_id
     WHERE p.code = 'stripe' AND pa.organization_id IS NULL AND pa.environment = 'SANDBOX'
     LIMIT 1`,
  );
  if (!acc.rows[0]?.id) {
    console.warn('[e2e] Platform Stripe SANDBOX account missing — run db:migrate:pg (035_stripe_provider.sql)');
    return;
  }
  await pool.query(`DELETE FROM provider_routes WHERE organization_id = $1 AND environment = 'SANDBOX'`, [orgId]);
  await pool.query(
    `INSERT INTO provider_routes (organization_id, environment, provider_account_id, priority, is_active)
     VALUES ($1, 'SANDBOX', $2, 10, TRUE)`,
    [orgId, acc.rows[0].id],
  );
}

await seedStripeRoutesForOrg(owner.organization_id);
await seedStripeRoutesForOrg(viewer.organization_id);

const merchants = {
  MERCHANT_OWNER: {
    email: owner.email,
    password: PASSWORD,
    organization_id: owner.organization_id,
    user_id: owner.user_id,
  },
  MERCHANT_VIEWER: {
    email: viewer.email,
    password: PASSWORD,
    organization_id: viewer.organization_id,
    user_id: viewer.user_id,
  },
};

for (const role of MERCHANT_ROLES.filter((r) => r !== 'MERCHANT_VIEWER')) {
  const email = `e2e-${role.toLowerCase()}@example.test`;
  const u = await register(email, `E2E ${role} Org`);
  await setMerchantRole(u.user_id, role);
  merchants[role] = {
    email,
    password: PASSWORD,
    organization_id: u.organization_id,
    user_id: u.user_id,
  };
}

const platforms = {};
for (const role of PLATFORM_ROLES) {
  const email = `e2e-${role.toLowerCase()}@example.test`;
  const u = await register(email, `E2E ${role} Org`);
  // Platform accounts are SEPARATE from merchants: platform role (NULL org), no merchant org, no KYB.
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id, organization_id)
     SELECT $1, r.id, NULL
     FROM roles r
     WHERE r.code=$2 AND r.organization_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM user_roles ur
         WHERE ur.user_id=$1 AND ur.role_id=r.id AND ur.organization_id IS NULL
       )`,
    [u.user_id, role],
  );
  // Remove the merchant organization created during registration (cascades membership + merchant roles).
  await pool.query(`DELETE FROM organizations WHERE id=$1`, [u.organization_id]);
  // Re-login so the session resolves to a platform account (organization_id = NULL).
  const platformToken = await login(email);
  platforms[role] = {
    email,
    password: PASSWORD,
    organization_id: null,
    user_id: u.user_id,
    access_token: platformToken,
  };
}

// Only merchants receive Stripe SANDBOX routes; platform accounts have no organization.
for (const entry of Object.values(merchants)) {
  await seedStripeRoutesForOrg(entry.organization_id);
}

// Enable MFA for owner (API key step-up / sensitive ops in E2E)
const mfaRes = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/mfa/enable`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${owner.access_token}`,
  },
  body: '{}',
});
const mfaBody = await mfaRes.json();
if (!mfaRes.ok) throw new Error(`owner MFA enable failed ${mfaRes.status} ${JSON.stringify(mfaBody)}`);
const ownerMfaSecret = mfaBody.data.secret;

await pool.end();

const creds = {
  apiBase: `http://127.0.0.1:${apiPort}`,
  webBase: process.env.V4_E2E_BASE_URL || 'http://127.0.0.1:5173',
  connectionString,
  owner: {
    email: owner.email,
    password: PASSWORD,
    organization_id: owner.organization_id,
    mfa_secret: ownerMfaSecret,
  },
  viewer: {email: viewer.email, password: PASSWORD, organization_id: viewer.organization_id},
  merchants,
  platforms,
};
fs.writeFileSync(credPath, JSON.stringify(creds, null, 2));
console.log('Wrote', credPath);
console.log('E2E stack ready. Keep this process running.');

function shutdown() {
  try {
    api.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  void pgEmbedded.stop().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep alive
await new Promise(() => undefined);
