import {test, expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  assertNoLegacyApiCalls,
  currentTotp,
  forceSubscriptionsDue,
  loadCreds,
  loginAs,
  logout,
} from './helpers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Independent tests (shared stack credentials). Avoid serial skip-after-fail.
test.describe('Phase 6.5 browser verification', () => {
  const creds = loadCreds();

  test('H — Legacy isolation (source + runtime)', async ({page}) => {
    const webSrc = path.resolve(__dirname, '../src');
    const entry = fs.readFileSync(path.join(webSrc, 'main.tsx'), 'utf8');
    expect(entry).not.toMatch(/legacy\/main\.legacy/);
    expect(entry).toMatch(/v4\/app\/App/);
    expect(fs.existsSync(path.join(webSrc, 'legacy/main.legacy.tsx'))).toBe(true);

    await assertNoLegacyApiCalls(page, async () => {
      await loginAs(page, creds.owner.email, creds.owner.password);
      await page.goto('/');
      await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible();
      await page.goto('/payment-links');
      await expect(page.getByRole('heading', {name: 'Payment Links'})).toBeVisible();
    });

    // Old tab labels from frozen console are not the V4 nav model
    await expect(page.getByRole('link', {name: 'API & Webhooks'})).toHaveCount(0);
    await expect(page.getByRole('link', {name: 'KYC/KYB'})).toHaveCount(0);
  });

  test('A — Authentication login → dashboard → logout → login', async ({page}) => {
    await assertNoLegacyApiCalls(page, async () => {
      await loginAs(page, creds.owner.email, creds.owner.password);
      await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible();
      await expect(page.getByText(/SANDBOX/i).first()).toBeVisible();
      await logout(page);
      await loginAs(page, creds.owner.email, creds.owner.password);
      await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible();
    });
  });

  test('B — Merchant profile / KYB / bank accounts', async ({page}) => {
    await loginAs(page, creds.owner.email, creds.owner.password);
    await assertNoLegacyApiCalls(page, async () => {
      await page.goto('/merchant/profile');
      await expect(page.getByRole('heading', {name: 'Merchant profile'})).toBeVisible();

      await page.goto('/merchant/kyb');
      await expect(page.getByRole('heading', {name: 'KYB'})).toBeVisible();
      await expect(page.getByText(/manual \/ stub/i)).toBeVisible();

      await page.goto('/merchant/bank-accounts');
      await expect(page.getByRole('heading', {name: /Bank/i})).toBeVisible();
      await expect(page.getByText(/Phase 7|not available|Money payouts/i)).toBeVisible();
    });
  });

  test('C — Payment Links create → list → detail → lifecycle', async ({page}) => {
    await loginAs(page, creds.owner.email, creds.owner.password);
    const title = `E2E Link ${Date.now()}`;

    await assertNoLegacyApiCalls(page, async () => {
      await page.goto('/payment-links');
      await page.getByRole('button', {name: 'Create link'}).click();
      await page.getByLabel('Title').fill(title);
      await page.getByLabel('Amount (minor units)').fill('2200');
      await page.getByLabel('Currency').fill('SAR');
      // Create with activate=true by default
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.getByText('Payment link created')).toBeVisible({timeout: 20_000});

      await expect(page.getByText(title)).toBeVisible();
      await page.getByRole('link', {name: 'Open'}).first().click();
      await expect(page.getByRole('heading', {name: title})).toBeVisible();
      await expect(page.getByText('/checkout/')).toBeVisible();

      await page.getByRole('button', {name: 'Deactivate'}).click();
      await expect(page.getByText(/Link deactivate/i)).toBeVisible({timeout: 15_000});
      await page.getByRole('button', {name: 'Activate'}).click();
      await expect(page.getByText(/Link activate/i)).toBeVisible({timeout: 15_000});
      await page.getByRole('button', {name: 'Cancel'}).click();
      await expect(page.getByText(/Link cancel/i)).toBeVisible({timeout: 15_000});
    });
  });

  test('D — Public Checkout sandbox payment', async ({page, context}) => {
    await loginAs(page, creds.owner.email, creds.owner.password);
    const title = `Checkout Link ${Date.now()}`;

    await page.goto('/payment-links');
    await page.getByRole('button', {name: 'Create link'}).click();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Amount (minor units)').fill('1800');
    await page.getByLabel('Currency').fill('SAR');
    await page.getByRole('button', {name: 'Create', exact: true}).click();
    await expect(page.getByText('Payment link created')).toBeVisible({timeout: 20_000});
    await page.getByRole('link', {name: 'Open'}).first().click();

    const href = await page.getByRole('link', {name: 'Open checkout'}).getAttribute('href');
    expect(href).toMatch(/^\/checkout\//);

    const checkout = await context.newPage();
    await assertNoLegacyApiCalls(checkout, async () => {
      await checkout.goto(href!);
      await expect(checkout.getByText('SANDBOX CHECKOUT')).toBeVisible();
      await checkout.getByRole('button', {name: 'Continue'}).click();
      await checkout.getByLabel('Sandbox payment method token').selectOption('tok_ok');
      await checkout.getByRole('button', {name: /pay securely/i}).click();
      await expect(checkout.getByText(/SUCCEEDED/i)).toBeVisible({timeout: 45_000});
      await expect(checkout.getByText(/Payment Core → Provider Router → Sandbox/i)).toBeVisible();
    });

    await page.goto('/payments');
    await expect(page.getByRole('heading', {name: 'Payments', exact: true})).toBeVisible();
    await expect(page.locator('.v4-badge.succeeded').first()).toBeVisible({timeout: 20_000});
  });

  test('E — Billing customer → product → price → subscription → invoice', async ({page}) => {
    await loginAs(page, creds.owner.email, creds.owner.password);
    const stamp = Date.now();

    await assertNoLegacyApiCalls(page, async () => {
      await page.goto('/customers');
      await page.getByRole('button', {name: 'Create customer'}).click();
      await page.getByLabel('Name').fill(`E2E Customer ${stamp}`);
      await page.getByLabel('Email').fill(`e2e-cust-${stamp}@example.test`);
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.getByText('Customer created')).toBeVisible();

      await page.goto('/products');
      await page.getByRole('button', {name: 'Create product'}).click();
      await page.getByLabel('Name').fill(`E2E Product ${stamp}`);
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.getByText('Product created')).toBeVisible();

      await page.goto('/prices');
      await page.getByRole('button', {name: 'Create price'}).click();
      await page.getByLabel('Amount (minor)').fill('3300');
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.getByText('Price created')).toBeVisible();

      await page.goto('/subscriptions');
      await page.getByRole('button', {name: 'Create subscription'}).click();
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.getByText('Subscription created')).toBeVisible();

      // BACKEND NOTE: subscription create sets next_billing_at = period end; renewals/run
      // only invoices due subs. No merchant "bill now" API — same SQL backdate as PG tests.
      forceSubscriptionsDue(creds.owner.organization_id);

      test.skip(!creds.owner.mfa_secret, 'Owner MFA secret missing — restart e2e-v4-stack.mjs');
      await page.getByRole('button', {name: 'Run renewals'}).click();
      await page.getByTestId('renewals-totp').fill(currentTotp(creds.owner.mfa_secret!));
      await page.getByRole('button', {name: 'Confirm renewals'}).click();
      await expect(page.getByText(/Renewals run/i)).toBeVisible({timeout: 30_000});

      await page.getByRole('link', {name: 'Invoices'}).click();
      await expect(page.getByRole('heading', {name: 'Invoices', exact: true})).toBeVisible({timeout: 20_000});
      // Invoice may be PAID after successful sandbox collection
      await expect(page.locator('.v4-badge').filter({hasText: /PAID|OPEN|OVERDUE|UNCOLLECTIBLE/}).first()).toBeVisible({
        timeout: 20_000,
      });
    });
  });

  test('F — RBAC visibility and unauthorized mutation', async ({page, request}) => {
    // Owner sees manage actions
    await loginAs(page, creds.owner.email, creds.owner.password);
    await page.goto('/payment-links');
    await expect(page.getByRole('button', {name: 'Create link'})).toBeVisible();
    await page.goto('/developers/api-keys');
    await expect(page.getByRole('button', {name: 'Create key'})).toBeVisible();
    await logout(page);

    // Viewer: read nav may exist; create actions hidden
    await loginAs(page, creds.viewer.email, creds.viewer.password);
    await page.goto('/payment-links');
    await expect(page.getByRole('heading', {name: 'Payment Links'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Create link'})).toHaveCount(0);

    await page.goto('/developers/api-keys');
    // Viewer lacks api_keys.read — route guard sends Forbidden UX
    await expect(
      page.getByRole('heading', {name: /Access denied|API Keys/i}).first(),
    ).toBeVisible({timeout: 15_000});
    await expect(page.getByRole('button', {name: 'Create key'})).toHaveCount(0);

    // Unauthorized API mutation rejected
    const login = await request.post(`${creds.apiBase}/api/v1/auth/login`, {
      data: {email: creds.viewer.email, password: creds.viewer.password},
    });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).data.access_token as string;
    const createLink = await request.post(`${creds.apiBase}/api/v1/merchant/payment-links`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: {
        title: 'Should Fail',
        amount_mode: 'FIXED',
        amount_minor: '100',
        currency_code: 'SAR',
      },
    });
    expect(createLink.status()).toBe(403);
  });

  test('G — Developer API Keys + Webhook events', async ({page}) => {
    test.skip(!creds.owner.mfa_secret, 'Owner MFA secret missing — restart e2e-v4-stack.mjs');
    await loginAs(page, creds.owner.email, creds.owner.password);

    await assertNoLegacyApiCalls(page, async () => {
      await page.goto('/developers/api-keys');
      await expect(page.getByRole('heading', {name: 'API Keys'})).toBeVisible();
      await page.getByRole('button', {name: 'Create key'}).click();
      await page.getByLabel('Name').fill(`E2E Key ${Date.now()}`);
      await page.getByTestId('api-key-totp').fill(currentTotp(creds.owner.mfa_secret!));
      await page.getByRole('button', {name: 'Create', exact: true}).click();
      await expect(page.locator('.v4-toast').filter({hasText: /API key created/i})).toBeVisible({timeout: 20_000});
      await expect(page.getByText(/Secret \(copy now/i)).toBeVisible();
      const copyBtn = page.getByRole('button', {name: /Copy & dismiss/i});
      if (await copyBtn.count()) await copyBtn.click();

      await page.getByRole('button', {name: 'Revoke'}).first().click();
      await page.getByTestId('api-key-revoke-totp').fill(currentTotp(creds.owner.mfa_secret!));
      await page.getByRole('button', {name: 'Revoke', exact: true}).click();
      await expect(page.locator('.v4-toast').filter({hasText: /API key revoked/i})).toBeVisible({timeout: 15_000});

      await page.goto('/providers/webhooks');
      await expect(page.getByRole('heading', {name: /webhook events/i})).toBeVisible();
      await expect(page.getByText(/do not currently apply Payment Intent/i)).toBeVisible();
    });
  });
});
