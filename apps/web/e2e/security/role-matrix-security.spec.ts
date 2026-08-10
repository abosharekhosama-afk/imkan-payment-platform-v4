/**
 * P15.0 E2E security matrix — role navigation + forbidden mutations + no onboarding skip UX.
 * Requires refreshed e2e stack credentials (`.tmp/e2e-credentials.json`).
 */
import {test, expect} from '@playwright/test';
import {apiJson, apiLogin, loadCreds, loginAs, logout} from '../helpers';

const creds = loadCreds();

test.describe('P15.0 security e2e', () => {
  test.skip(!creds?.merchants, 'e2e credentials missing merchants map');

  test('MERCHANT_VIEWER — roles deep-link denied + mutate APIs forbidden', async ({page, request}) => {
    const user = creds.merchants!.MERCHANT_VIEWER || creds.viewer;
    await loginAs(page, user.email, user.password);
    await page.goto('/security/roles');
    await expect(page.getByRole('heading', {name: /Access denied/i})).toBeVisible({timeout: 15_000});

    const token = await apiLogin(request, creds.apiBase, user.email, user.password);
    for (const deny of [
      {
        method: 'POST',
        path: '/api/v1/merchant/payment-links',
        data: {title: 'x', amount_mode: 'FIXED', amount_minor: '100', currency_code: 'SAR'},
      },
      {method: 'POST', path: '/api/v1/api-keys', data: {name: 'x', environment: 'SANDBOX', scopes: ['payments.read']}},
    ]) {
      const res = await apiJson(request, creds.apiBase, deny.method, deny.path, {
        token,
        idempotent: true,
        data: deny.data,
      });
      expect([401, 403]).toContain(res.status);
    }
    await logout(page);
  });

  test('MERCHANT_FINANCE cannot create custom roles', async ({request}) => {
    const user = creds.merchants!.MERCHANT_FINANCE;
    test.skip(!user, 'missing FINANCE creds');
    const token = await apiLogin(request, creds.apiBase, user.email, user.password);
    const res = await apiJson(request, creds.apiBase, 'POST', '/api/v1/rbac/roles', {
      token,
      idempotent: true,
      data: {name: 'escalate', permissions: ['roles.manage']},
    });
    expect([401, 403]).toContain(res.status);
  });

  test('onboarding UI has no sessionStorage skip / Continue anyway', async ({page}) => {
    const user = creds.merchants!.MERCHANT_OWNER || creds.owner;
    await loginAs(page, user.email, user.password);
    await page.goto('/onboarding');
    await expect(page.getByRole('button', {name: /anyway/i})).toHaveCount(0);
    await expect(page.getByText(/Skip flags are not trusted|enforced by the API/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
