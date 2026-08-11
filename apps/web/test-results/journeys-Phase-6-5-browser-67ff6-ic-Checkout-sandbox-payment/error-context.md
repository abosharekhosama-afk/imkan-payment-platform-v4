# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: journeys.spec.ts >> Phase 6.5 browser verification >> D — Public Checkout sandbox payment
- Location: e2e\journeys.spec.ts:95:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('V4 Console')
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText('V4 Console')

```

```yaml
- text: V4
- heading "IMKAN Payments" [level=1]
- paragraph: Sign in to the V4 merchant console
- text: "Active console uses PostgreSQL `/api/v1` only. Sandbox is the payment rail. TypeError: Failed to fetch Email"
- textbox "Email": e2e-owner@example.test
- text: Password
- textbox "Password": SecurePass!123
- button "Sign in"
- paragraph:
  - text: New merchant?
  - link "Create an account":
    - /url: /signup
  - link "Forgot password":
    - /url: /forgot-password
  - text: ·
  - link "Resend verification":
    - /url: /resend-verification
```

# Test source

```ts
  1   | import fs from 'node:fs';
  2   | import path from 'node:path';
  3   | import crypto from 'node:crypto';
  4   | import {fileURLToPath} from 'node:url';
  5   | import {execFileSync} from 'node:child_process';
  6   | import {expect, type Page, type APIRequestContext} from '@playwright/test';
  7   | 
  8   | const __dirname = path.dirname(fileURLToPath(import.meta.url));
  9   | const root = path.resolve(__dirname, '../../..');
  10  | const credPath = path.resolve(root, '.tmp/e2e-credentials.json');
  11  | 
  12  | export type RoleCred = {
  13  |   email: string;
  14  |   password: string;
  15  |   organization_id: string;
  16  |   user_id?: string;
  17  |   mfa_secret?: string;
  18  | };
  19  | 
  20  | export type E2ECreds = {
  21  |   apiBase: string;
  22  |   webBase: string;
  23  |   connectionString?: string;
  24  |   owner: RoleCred;
  25  |   viewer: RoleCred;
  26  |   merchants?: Record<string, RoleCred>;
  27  |   platforms?: Record<string, RoleCred>;
  28  | };
  29  | 
  30  | /** Test harness: backdate next_billing_at (same approach as phase6-billing.test.ts). */
  31  | export function forceSubscriptionsDue(organizationId: string) {
  32  |   const script = path.join(root, 'scripts', 'e2e-force-subscriptions-due.mjs');
  33  |   const out = execFileSync(process.execPath, [script, organizationId], {
  34  |     cwd: root,
  35  |     encoding: 'utf8',
  36  |   });
  37  |   return JSON.parse(out.trim().split('\n').pop() || '{}');
  38  | }
  39  | 
  40  | export function loadCreds(): E2ECreds {
  41  |   if (!fs.existsSync(credPath)) {
  42  |     throw new Error(`Missing ${credPath}. Start the stack first: node scripts/e2e-v4-stack.mjs`);
  43  |   }
  44  |   return JSON.parse(fs.readFileSync(credPath, 'utf8'));
  45  | }
  46  | 
  47  | function base32Decode(input: string): Buffer {
  48  |   const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  49  |   const cleaned = input.replace(/=+$/, '').toUpperCase();
  50  |   let bits = 0;
  51  |   let value = 0;
  52  |   const out: number[] = [];
  53  |   for (const ch of cleaned) {
  54  |     const idx = alphabet.indexOf(ch);
  55  |     if (idx < 0) continue;
  56  |     value = (value << 5) | idx;
  57  |     bits += 5;
  58  |     if (bits >= 8) {
  59  |       out.push((value >>> (bits - 8)) & 0xff);
  60  |       bits -= 8;
  61  |     }
  62  |   }
  63  |   return Buffer.from(out);
  64  | }
  65  | 
  66  | export function currentTotp(secretBase32: string): string {
  67  |   const secret = base32Decode(secretBase32);
  68  |   const counter = Math.floor(Date.now() / 1000 / 30);
  69  |   const buf = Buffer.alloc(8);
  70  |   buf.writeBigUInt64BE(BigInt(counter));
  71  |   const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  72  |   const offset = hmac[hmac.length - 1] & 0xf;
  73  |   const code =
  74  |     ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  75  |   return String(code % 1_000_000).padStart(6, '0');
  76  | }
  77  | 
  78  | export async function loginAs(page: Page, email: string, password: string) {
  79  |   await page.goto('/login');
  80  |   await page.getByLabel('Email').fill(email);
  81  |   await page.getByLabel('Password').fill(password);
  82  |   await page.getByRole('button', {name: /sign in/i}).click();
> 83  |   await expect(page.getByText('V4 Console')).toBeVisible({timeout: 30_000});
      |                                              ^ Error: expect(locator).toBeVisible() failed
  84  | }
  85  | 
  86  | export async function logout(page: Page) {
  87  |   await page.getByRole('button', {name: /log out/i}).click();
  88  |   await expect(page.getByRole('button', {name: /sign in/i})).toBeVisible({timeout: 15_000});
  89  | }
  90  | 
  91  | export async function assertNoLegacyApiCalls(page: Page, during: () => Promise<void>) {
  92  |   const legacyHits: string[] = [];
  93  |   const handler = (req: {url: () => string}) => {
  94  |     const u = req.url();
  95  |     try {
  96  |       const pathName = new URL(u).pathname;
  97  |       if (pathName === '/v1' || pathName.startsWith('/v1/')) legacyHits.push(pathName);
  98  |       if (pathName.startsWith('/checkout/public')) legacyHits.push(pathName);
  99  |       if (/^\/pay\//.test(pathName)) legacyHits.push(pathName);
  100 |     } catch {
  101 |       /* ignore */
  102 |     }
  103 |   };
  104 |   page.on('request', handler);
  105 |   try {
  106 |     await during();
  107 |   } finally {
  108 |     page.off('request', handler);
  109 |   }
  110 |   expect(legacyHits, `Legacy API calls: ${legacyHits.join(', ')}`).toEqual([]);
  111 | }
  112 | 
  113 | export async function apiLogin(request: APIRequestContext, apiBase: string, email: string, password: string) {
  114 |   const login = await request.post(`${apiBase}/api/v1/auth/login`, {data: {email, password}});
  115 |   expect(login.ok()).toBeTruthy();
  116 |   return (await login.json()).data.access_token as string;
  117 | }
  118 | 
  119 | export async function apiStepUp(request: APIRequestContext, apiBase: string, token: string, mfaSecret: string) {
  120 |   const step = await request.post(`${apiBase}/api/v1/auth/mfa/step-up`, {
  121 |     headers: {Authorization: `Bearer ${token}`},
  122 |     data: {totp: currentTotp(mfaSecret)},
  123 |   });
  124 |   expect(step.ok(), await step.text()).toBeTruthy();
  125 |   return (await step.json()).data.step_up_token as string;
  126 | }
  127 | 
  128 | export async function apiJson(
  129 |   request: APIRequestContext,
  130 |   apiBase: string,
  131 |   method: string,
  132 |   pathName: string,
  133 |   opts: {token?: string; data?: unknown; idempotent?: boolean; stepUpToken?: string} = {},
  134 | ) {
  135 |   const headers: Record<string, string> = {'Content-Type': 'application/json'};
  136 |   if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  137 |   if (opts.idempotent) headers['Idempotency-Key'] = crypto.randomUUID();
  138 |   if (opts.stepUpToken) headers['X-Step-Up-Token'] = opts.stepUpToken;
  139 |   const res = await request.fetch(`${apiBase}${pathName}`, {
  140 |     method,
  141 |     headers,
  142 |     data: opts.data,
  143 |   });
  144 |   const body = await res.json().catch(() => ({}));
  145 |   return {status: res.status(), body};
  146 | }
  147 | 
```