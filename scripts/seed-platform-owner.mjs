/**
 * Bootstrap the initial platform owner (separate from any merchant organization).
 * The platform owner has PLATFORM_OWNER role with organization_id = NULL and NO KYB.
 *
 * Usage:
 *   node scripts/seed-platform-owner.mjs
 *   PLATFORM_OWNER_EMAIL=ops@imkan.example PLATFORM_OWNER_PASSWORD='StrongPass123!' node scripts/seed-platform-owner.mjs
 */
import crypto from 'node:crypto';
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

const email = (process.env.PLATFORM_OWNER_EMAIL || 'owner@platform.local').trim();
const password = process.env.PLATFORM_OWNER_PASSWORD || 'PlatformOwner123!';
const name = process.env.PLATFORM_OWNER_NAME || 'Platform Owner';
const emailNormalized = email.toLowerCase();

if (password.length < 10) {
  console.error('PLATFORM_OWNER_PASSWORD must be at least 10 characters.');
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL_PG || process.env.POSTGRES_URL || 'postgres://imkan:imkan@127.0.0.1:5432/imkan_payments';
const pool = new pg.Pool({connectionString});

const client = await pool.connect();
try {
  await client.query('BEGIN');

  const role = await client.query(
    `SELECT id FROM roles WHERE code='PLATFORM_OWNER' AND scope='PLATFORM' AND organization_id IS NULL`,
  );
  if (!role.rows[0]) {
    console.error('PLATFORM_OWNER role missing. Run: npm run db:migrate:pg');
    process.exit(1);
  }
  const roleId = role.rows[0].id;

  let user = await client.query(`SELECT id FROM users WHERE email_normalized=$1`, [emailNormalized]);
  let userId = user.rows[0]?.id;
  let created = false;
  if (!userId) {
    userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO users(id, email, email_normalized, password_hash, name, status, email_verified_at)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW())`,
      [userId, email, emailNormalized, hashPassword(password), name],
    );
    created = true;
  }

  await client.query(
    `INSERT INTO user_roles(user_id, role_id, organization_id)
     SELECT $1,$2,NULL
     WHERE NOT EXISTS (
       SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2 AND organization_id IS NULL
     )`,
    [userId, roleId],
  );

  await client.query('COMMIT');
  console.log(`Platform owner ${created ? 'created' : 'already existed (role ensured)'}: ${email}`);
  console.log(created ? `Password: ${password}` : 'Password unchanged.');
  console.log('Log in at /login — you will be routed to /platform.');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Failed to seed platform owner:', err.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
