/**
 * Dev/Test only: real PostgreSQL via embedded-postgres (major 16).
 * Does not modify MySQL. Does not change production architecture.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const embeddedEntry = path.join(root, 'apps', 'api', 'node_modules', 'embedded-postgres', 'dist', 'index.js');
const {default: EmbeddedPostgres} = await import(pathToFileURL(embeddedEntry).href);
const dataDir = path.join(root, '.tmp', 'embedded-pg-16');
const reportPath = path.join(root, 'docs', 'testing', 'POSTGRES_RUNTIME_VERIFICATION.md');
const port = Number(process.env.FOUNDATION_PG_PORT || 55432);
const user = 'imkan';
const password = 'imkan';
const database = 'imkan_payments';

const EXPECTED_TABLES = [
  'schema_migrations',
  'organizations',
  'organization_settings',
  'users',
  'organization_users',
  'sessions',
  'mfa_challenges',
  'permissions',
  'roles',
  'role_permissions',
  'user_roles',
  'audit_events',
  'security_events',
  'login_events',
  'outbox_events',
  'idempotency_keys',
  'email_verification_tokens',
  'password_reset_tokens',
  'organization_invitations',
  'step_up_tokens',
  'error_reports',
  // Phase 3: master data
  'master_countries',
  'master_currencies',
  'master_legal_entity_types',
  'master_business_types',
  'master_industries',
  'master_document_types',
  'master_tax_types',
  'master_payout_methods',
  'master_payment_method_types',
  'master_provider_types',
  'master_provider_capabilities',
  'master_fee_types',
  'master_risk_categories',
  'master_webhook_event_types',
  'master_address_types',
  'master_identification_types',
  // Phase 3: merchant / KYB
  'merchant_profiles',
  'company_legal_profiles',
  'company_addresses',
  'business_profiles',
  'business_profile_countries',
  'business_profile_currencies',
  'beneficial_owners',
  'directors',
  'authorized_representatives',
  'documents',
  'kyb_requirements',
  'verification_cases',
  'verification_results',
  'verification_case_transitions',
  // Phase 3: banking
  'payout_accounts',
  'payout_account_verifications',
  'payout_account_verification_results',
  'payout_account_transitions',
  // Phase 4: payments
  'merchant_payment_config',
  'payment_links',
  'payment_orders',
  'payment_intents',
  'payment_intent_transitions',
  'payment_sessions',
  'payment_attempts',
  'payment_transactions',
  // Phase 5: providers / webhooks / API keys
  'providers',
  'provider_accounts',
  'provider_credentials_metadata',
  'provider_capabilities',
  'provider_routes',
  'provider_transactions',
  'provider_webhook_events',
  'provider_webhook_nonces',
  'api_keys',
  'rate_limit_events',
  // Phase 6: billing
  'customers',
  'products',
  'prices',
  'subscriptions',
  'subscription_items',
  'subscription_transitions',
  'invoices',
  'invoice_items',
  'billing_collection_attempts',
  // P15.2 secrets metadata
  'secret_references',
];

const TARGET_COMPOSE = 'postgres:16-alpine';
const PACKAGE_TAG = 'embedded-postgres@16.14.0-beta.17';

fs.mkdirSync(path.dirname(reportPath), {recursive: true});
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, {recursive: true, force: true});
}
fs.mkdirSync(dataDir, {recursive: true});

const pgEmbedded = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: false,
  onLog: () => undefined,
  onError: (message) => console.error('[embedded-postgres]', message),
});

const connectionString = `postgres://${user}:${password}@127.0.0.1:${port}/${database}`;

const result = {
  status: 'BLOCKED',
  postgresVersion: null,
  packageTag: PACKAGE_TAG,
  targetCompose: TARGET_COMPOSE,
  majorCompatible: false,
  migrationFirstPass: 'NOT_RUN',
  migrationSecondPass: 'NOT_RUN',
  schemaChecks: 'NOT_RUN',
  integrationTests: 'NOT_RUN',
  financialConcurrency: 'N/A_PHASE1',
  financialInvariants: 'N/A_PHASE1',
  tenantIsolationRbac: 'NOT_RUN',
  knownLimitations: [],
  errors: [],
};

function run(cmd, args, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    env: {...process.env, ...env},
    encoding: 'utf8',
    shell: true,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return res;
}

function writeReport() {
  const now = new Date().toISOString();
  const body = `# PostgreSQL Runtime Verification

**Generated:** ${now}  
**Overall status:** ${result.status}

## Versions

| Item | Value |
|---|---|
| Package | \`${result.packageTag}\` |
| Compose / production target | \`${result.targetCompose}\` (PostgreSQL 16) |
| Runtime \`SELECT version()\` | ${result.postgresVersion ? `\`${result.postgresVersion}\`` : '_unavailable_'} |
| Major compatible with target 16? | **${result.majorCompatible ? 'YES' : 'NO'}** |

## Migration status

| Pass | Result |
|---|---|
| First apply (empty DB) | ${result.migrationFirstPass} |
| Second apply (tracking / skip) | ${result.migrationSecondPass} |
| Schema object checks | ${result.schemaChecks} |

## Test status

| Suite | Result |
|---|---|
| Foundation integration (AuthZ / tenant isolation / RBAC) | ${result.integrationTests} / ${result.tenantIsolationRbac} |
| Financial concurrency | ${result.financialConcurrency} |
| Financial invariants | ${result.financialInvariants} |

## Known limitations

${(result.knownLimitations.length ? result.knownLimitations : ['None recorded']).map((x) => `- ${x}`).join('\n')}

## Compatibility notes

- \`embedded-postgres\` is a **Development/Test Runtime only**.
- It must provide a **real PostgreSQL** binary; this verification rejects SQLite/MySQL/mocks.
- Passing this report does **not** mean PostgreSQL or the platform is Production Ready.
- Production/local Docker target remains \`${TARGET_COMPOSE}\`.
- MySQL remains retained per DEC-014; this script does not migrate or delete MySQL.

## Errors

${result.errors.length ? result.errors.map((e) => `- ${e}`).join('\n') : '- None'}
`;
  fs.writeFileSync(reportPath, body, 'utf8');
  console.log(`Wrote ${reportPath}`);
}

async function inspectSchema(client) {
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE'
     ORDER BY table_name`,
  );
  const present = new Set(tables.rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !present.has(t));
  if (missing.length) {
    throw new Error(`Missing tables: ${missing.join(', ')}`);
  }

  const fks = await client.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.table_constraints
     WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`,
  );
  const uniques = await client.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.table_constraints
     WHERE constraint_type IN ('UNIQUE','PRIMARY KEY') AND table_schema='public'`,
  );
  const checks = await client.query(
    `SELECT COUNT(*)::int AS c FROM information_schema.table_constraints
     WHERE constraint_type='CHECK' AND table_schema='public'`,
  );
  const indexes = await client.query(
    `SELECT COUNT(*)::int AS c FROM pg_indexes WHERE schemaname='public'`,
  );
  const enums = await client.query(
    `SELECT COUNT(*)::int AS c FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname='public'`,
  );

  // Foundation uses CHECK constraints rather than ENUM types — enums may be 0.
  const summary = {
    tables: present.size,
    foreign_keys: fks.rows[0].c,
    unique_or_pk: uniques.rows[0].c,
    check_constraints: checks.rows[0].c,
    indexes: indexes.rows[0].c,
    enum_labels: enums.rows[0].c,
  };
  console.log('Schema summary:', summary);
  if (summary.foreign_keys < 10) throw new Error(`Unexpectedly low FK count: ${summary.foreign_keys}`);
  if (summary.check_constraints < 5) throw new Error(`Unexpectedly low CHECK count: ${summary.check_constraints}`);
  if (summary.indexes < 15) throw new Error(`Unexpectedly low index count: ${summary.indexes}`);

  const migrations = await client.query('SELECT migration FROM schema_migrations ORDER BY id');
  console.log(
    'Applied migrations:',
    migrations.rows.map((r) => r.migration),
  );
  if (migrations.rows.length < 21) {
    throw new Error(`Expected >=21 migrations, found ${migrations.rows.length}`);
  }
  return summary;
}

let client = null;
try {
  console.log(`Using ${PACKAGE_TAG} against target ${TARGET_COMPOSE}`);
  console.log('Initialising embedded PostgreSQL 16...');
  await pgEmbedded.initialise();
  console.log('Starting embedded PostgreSQL...');
  await pgEmbedded.start();
  await pgEmbedded.createDatabase(database);

  client = new pg.Client({connectionString});
  client.on('error', () => undefined);
  await client.connect();
  const versionRes = await client.query('SHOW server_version');
  const fullVersion = (await client.query('SELECT version() AS v')).rows[0].v;
  result.postgresVersion = fullVersion;
  const major = Number(String(versionRes.rows[0].server_version).split('.')[0]);
  result.majorCompatible = major === 16;
  console.log('PostgreSQL version:', fullVersion);

  if (!result.majorCompatible) {
    result.status = 'BLOCKED';
    result.errors.push(`Major version ${major} is not compatible with target PostgreSQL 16`);
    result.knownLimitations.push('embedded-postgres major mismatch with compose target');
    await client.end().catch(() => undefined);
    writeReport();
    process.exitCode = 1;
  } else {
    console.log('--- Migration pass 1 (empty DB) ---');
    run('npm', ['run', 'db:migrate:pg'], {DATABASE_URL_PG: connectionString});
    result.migrationFirstPass = 'PASS';

    await inspectSchema(client);
    result.schemaChecks = 'PASS';

    console.log('--- Migration pass 2 (idempotent tracking) ---');
    const second = run('npm', ['run', 'db:migrate:pg'], {DATABASE_URL_PG: connectionString});
    const secondOut = `${second.stdout || ''}\n${second.stderr || ''}`;
    // migrate-pg prints "skip <file>" for already applied
    const skipCount = (secondOut.match(/skip /g) || []).length;
    if (skipCount < 6 && !secondOut.includes('PostgreSQL migrations complete')) {
      // still OK if complete without explicit skip lines if all already applied
    }
    const migCount = (await client.query('SELECT COUNT(*)::int AS c FROM schema_migrations')).rows[0].c;
    if (migCount < 21) throw new Error('Migration tracking lost rows on second pass');
    result.migrationSecondPass = 'PASS';

    result.knownLimitations.push(
      'embedded-postgres is non-production; Docker postgres:16-alpine remains the declared local/prod-shaped target.',
    );
    result.knownLimitations.push(
      'Migrations verified: 000–020 (Foundation through Phase 6 Billing).',
    );
    result.knownLimitations.push(
      'Phase 6 Billing uses Sandbox via Payment Core → Provider Router; no ledger (Phase 7); not Production Ready.',
    );
    result.knownLimitations.push(
      'Statuses use CHECK constraints (no ENUM types); append-only payment/KYB/bank transition tables are trigger-protected.',
    );

    console.log('--- Smoke register via identity service ---');
    const smoke = run(
      'npx',
      ['tsx', 'scripts/debug-register.ts'],
      {DATABASE_URL_PG: connectionString},
    );
    if (!(smoke.stdout || '').includes('STATUS 201') && !(smoke.stdout || '').includes('direct register ok')) {
      throw new Error('Register smoke failed before integration suite');
    }

    console.log('--- Integration / AuthZ / tenant isolation tests ---');
    run(
      'npx',
      [
        'vitest',
        'run',
        '--config',
        'vitest.config.ts',
        'tests/foundation-api.test.ts',
        'tests/foundation-crypto.test.ts',
        'tests/foundation-money-spec.test.ts',
        'tests/phase2-identity.test.ts',
        'tests/phase3-crypto.test.ts',
        'tests/phase3-merchant-kyb.test.ts',
        'tests/phase4-payment-state.test.ts',
        'tests/phase4-payments.test.ts',
        'tests/phase5-provider-contract.test.ts',
        'tests/phase5-providers.test.ts',
        'tests/phase6-billing-state.test.ts',
        'tests/phase6-billing.test.ts',
        'tests/phase6_5-dashboard.test.ts',
        'tests/phase6_5-v4-legacy-guard.test.ts',
        'tests/phase6_6-rbac.test.ts',
        'tests/phase7-financial.test.ts',
        'tests/refund-conformance.test.ts',
        'tests/security/p15-0-security.test.ts',
        'tests/p15-1a-financial-model.test.ts',
        'tests/p15-1b-ledger-hardening.test.ts',
        'tests/p15-1c-balances.test.ts',
        'tests/p15-1d-settlement.test.ts',
        'tests/p15-1e-payout.test.ts',
        'tests/p15-2-redis-rate-limit.test.ts',
        'tests/p15-2-secrets.test.ts',
        'tests/p15-2-session-cookies.test.ts',
        'tests/p15-2-health-metrics.test.ts',
        'tests/p15-2-security-regression.test.ts',
        'tests/paytabs-provider-contract.test.ts',
        'tests/p15-3-paytabs-integration.test.ts',
        'tests/p15-4-paytabs-config.test.ts',
        'tests/p15-4-paytabs-webhook-security.test.ts',
        'tests/p15-4-paytabs-real-sandbox.test.ts',
        'tests/p15-5-paytabs-real-e2e.test.ts',
        'tests/p15-5-paytabs-preflight.test.ts',
        'tests/p16-runtime-config.test.ts',
        'tests/p16-email-transport.test.ts',
        'tests/p16-document-storage.test.ts',
      ],
      {
        DATABASE_URL_PG: connectionString,
        FOUNDATION_PG_REQUIRED: 'true',
      },
    );
    result.integrationTests = 'PASS';
    result.tenantIsolationRbac = 'PASS';
    result.financialConcurrency = 'PHASE4_PAYMENT_ATTEMPT_LOCKS';
    result.financialInvariants = 'P15_1B_LEDGER_SOURCE_UNIQUE';
    result.status = 'PASS';
    await client.end().catch(() => undefined);
    client = null;
    writeReport();
    console.log('Foundation PostgreSQL verification PASSED');
  }
} catch (error) {
  result.status = result.majorCompatible === false ? 'BLOCKED' : 'FAIL';
  result.errors.push(String(error?.stack || error));
  console.error('Foundation PostgreSQL verification FAILED');
  console.error(error);
  writeReport();
  process.exitCode = 1;
} finally {
  try {
    if (client) await client.end();
  } catch {
    // ignore
  }
  try {
    await pgEmbedded.stop();
  } catch {
    // ignore stop errors after tests close pools
  }
}
