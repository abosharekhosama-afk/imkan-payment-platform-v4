import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {expect, type Page, type APIRequestContext} from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const credPath = path.resolve(root, '.tmp/e2e-credentials.json');

export type RoleCred = {
  email: string;
  password: string;
  organization_id: string;
  user_id?: string;
  mfa_secret?: string;
};

export type E2ECreds = {
  apiBase: string;
  webBase: string;
  connectionString?: string;
  owner: RoleCred;
  viewer: RoleCred;
  merchants?: Record<string, RoleCred>;
  platforms?: Record<string, RoleCred>;
};

/** Test harness: backdate next_billing_at (same approach as phase6-billing.test.ts). */
export function forceSubscriptionsDue(organizationId: string) {
  const script = path.join(root, 'scripts', 'e2e-force-subscriptions-due.mjs');
  const out = execFileSync(process.execPath, [script, organizationId], {
    cwd: root,
    encoding: 'utf8',
  });
  return JSON.parse(out.trim().split('\n').pop() || '{}');
}

export function loadCreds(): E2ECreds {
  if (!fs.existsSync(credPath)) {
    throw new Error(`Missing ${credPath}. Start the stack first: node scripts/e2e-v4-stack.mjs`);
  }
  return JSON.parse(fs.readFileSync(credPath, 'utf8'));
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function currentTotp(secretBase32: string): string {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', {name: /sign in/i}).click();
  await expect(page.getByText('V4 Console')).toBeVisible({timeout: 30_000});
}

export async function logout(page: Page) {
  await page.getByRole('button', {name: /log out/i}).click();
  await expect(page.getByRole('button', {name: /sign in/i})).toBeVisible({timeout: 15_000});
}

export async function assertNoLegacyApiCalls(page: Page, during: () => Promise<void>) {
  const legacyHits: string[] = [];
  const handler = (req: {url: () => string}) => {
    const u = req.url();
    try {
      const pathName = new URL(u).pathname;
      if (pathName === '/v1' || pathName.startsWith('/v1/')) legacyHits.push(pathName);
      if (pathName.startsWith('/checkout/public')) legacyHits.push(pathName);
      if (/^\/pay\//.test(pathName)) legacyHits.push(pathName);
    } catch {
      /* ignore */
    }
  };
  page.on('request', handler);
  try {
    await during();
  } finally {
    page.off('request', handler);
  }
  expect(legacyHits, `Legacy API calls: ${legacyHits.join(', ')}`).toEqual([]);
}

export async function apiLogin(request: APIRequestContext, apiBase: string, email: string, password: string) {
  const login = await request.post(`${apiBase}/api/v1/auth/login`, {data: {email, password}});
  expect(login.ok()).toBeTruthy();
  return (await login.json()).data.access_token as string;
}

export async function apiStepUp(request: APIRequestContext, apiBase: string, token: string, mfaSecret: string) {
  const step = await request.post(`${apiBase}/api/v1/auth/mfa/step-up`, {
    headers: {Authorization: `Bearer ${token}`},
    data: {totp: currentTotp(mfaSecret)},
  });
  expect(step.ok(), await step.text()).toBeTruthy();
  return (await step.json()).data.step_up_token as string;
}

export async function apiJson(
  request: APIRequestContext,
  apiBase: string,
  method: string,
  pathName: string,
  opts: {token?: string; data?: unknown; idempotent?: boolean; stepUpToken?: string} = {},
) {
  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  if (opts.stepUpToken) headers['X-Step-Up-Token'] = opts.stepUpToken;
  const res = await request.fetch(`${apiBase}${pathName}`, {
    method,
    headers,
    data: opts.data,
  });
  const body = await res.json().catch(() => ({}));
  return {status: res.status(), body};
}
