import {test, expect} from '@playwright/test';
import {apiJson, apiLogin, loadCreds, loginAs, logout} from './helpers';

/**
 * Phase 6.6 — full merchant + platform role matrix (browser + API).
 * Requires refreshed e2e stack credentials with merchants/platforms maps.
 */
const creds = loadCreds();

type Expectation = {
  navIncludes: string[];
  navExcludes: string[];
  deepLinksForbidden: string[];
  createHidden: Array<{path: string; button: string | RegExp}>;
  mutateDenies: Array<{method: string; path: string; data?: unknown}>;
};

const MERCHANT_EXPECT: Record<string, Expectation> = {
  MERCHANT_OWNER: {
    navIncludes: ['Payment Links', 'API Keys', 'Customers', 'Roles', 'Users & Invites'],
    navExcludes: [],
    deepLinksForbidden: [],
    createHidden: [],
    mutateDenies: [],
  },
  MERCHANT_ADMIN: {
    navIncludes: ['Payment Links', 'API Keys', 'Customers', 'Roles'],
    navExcludes: [],
    deepLinksForbidden: [],
    createHidden: [],
    mutateDenies: [],
  },
  MERCHANT_FINANCE: {
    navIncludes: ['Payments', 'Customers', 'Invoices'],
    navExcludes: ['API Keys', 'Roles'],
    deepLinksForbidden: ['/developers/api-keys', '/security/roles'],
    createHidden: [{path: '/developers/api-keys', button: /Create key/i}],
    mutateDenies: [
      {method: 'POST', path: '/api/v1/api-keys', data: {name: 'x', environment: 'SANDBOX', scopes: ['payments.read']}},
      {
        method: 'POST',
        path: '/api/v1/rbac/roles',
        data: {name: 'x', permissions: ['payments.read']},
      },
    ],
  },
  MERCHANT_DEVELOPER: {
    navIncludes: ['API Keys', 'Providers'],
    navExcludes: ['Roles'],
    deepLinksForbidden: ['/security/roles'],
    createHidden: [],
    mutateDenies: [
      {
        method: 'POST',
        path: '/api/v1/merchant/payment-links',
        data: {title: 'x', amount_mode: 'FIXED', amount_minor: '100', currency_code: 'SAR'},
      },
    ],
  },
  MERCHANT_SUPPORT: {
    navIncludes: ['Payments', 'Customers'],
    navExcludes: ['API Keys', 'Roles'],
    deepLinksForbidden: ['/developers/api-keys', '/security/roles'],
    createHidden: [{path: '/payment-links', button: /Create link/i}],
    mutateDenies: [
      {method: 'POST', path: '/api/v1/api-keys', data: {name: 'x', environment: 'SANDBOX', scopes: ['payments.read']}},
      {
        method: 'POST',
        path: '/api/v1/merchant/payment-links',
        data: {title: 'x', amount_mode: 'FIXED', amount_minor: '100', currency_code: 'SAR'},
      },
    ],
  },
  MERCHANT_VIEWER: {
    navIncludes: ['Payments', 'Payment Links'],
    navExcludes: ['API Keys', 'Roles'],
    deepLinksForbidden: ['/developers/api-keys', '/security/roles'],
    createHidden: [
      {path: '/payment-links', button: /Create link/i},
      {path: '/customers', button: /Create customer/i},
    ],
    mutateDenies: [
      {
        method: 'POST',
        path: '/api/v1/merchant/payment-links',
        data: {title: 'x', amount_mode: 'FIXED', amount_minor: '100', currency_code: 'SAR'},
      },
      {method: 'POST', path: '/api/v1/billing/renewals/run', data: {}},
      {
        method: 'POST',
        path: '/api/v1/api-keys',
        data: {name: 'x', environment: 'SANDBOX', scopes: ['payments.read']},
      },
    ],
  },
};

const PLATFORM_EXPECT: Record<string, {kybList: number; paymentsOrgScopedDeny?: boolean}> = {
  PLATFORM_OWNER: {kybList: 200},
  PLATFORM_ADMIN: {kybList: 200},
  PLATFORM_SUPPORT: {kybList: 403},
  PLATFORM_FINANCE: {kybList: 403},
};

test.describe('Phase 6.6 merchant role matrix', () => {
  test.skip(!creds.merchants, 'Stack credentials missing merchants map — restart e2e-v4-stack.mjs');

  for (const [role, expectation] of Object.entries(MERCHANT_EXPECT)) {
    test(`${role} — nav + forbidden + create hidden + API deny`, async ({page, request}) => {
      const user = creds.merchants![role] || (role === 'MERCHANT_OWNER' ? creds.owner : creds.viewer);
      await loginAs(page, user.email, user.password);

      for (const label of expectation.navIncludes) {
        await expect(page.getByRole('link', {name: label, exact: true}).first()).toBeVisible({timeout: 15_000});
      }
      for (const label of expectation.navExcludes) {
        await expect(page.getByRole('navigation').getByRole('link', {name: label, exact: true})).toHaveCount(0);
      }

      for (const pathName of expectation.deepLinksForbidden) {
        await page.goto(pathName);
        await expect(page.getByRole('heading', {name: /Access denied/i})).toBeVisible({timeout: 15_000});
      }

      for (const item of expectation.createHidden) {
        // Deep-link may already be forbidden — skip button assert if Access denied
        await page.goto(item.path);
        const denied = await page.getByRole('heading', {name: /Access denied/i}).count();
        if (denied === 0) {
          await expect(page.getByRole('button', {name: item.button})).toHaveCount(0);
        }
      }

      if (expectation.mutateDenies.length) {
        const token = await apiLogin(request, creds.apiBase, user.email, user.password);
        for (const deny of expectation.mutateDenies) {
          const res = await apiJson(request, creds.apiBase, deny.method, deny.path, {
            token,
            idempotent: true,
            data: deny.data,
          });
          expect([401, 403]).toContain(res.status);
        }
      }

      await logout(page);
    });
  }
});

test.describe('Phase 6.6 platform role matrix (API)', () => {
  test.skip(!creds.platforms, 'Stack credentials missing platforms map — restart e2e-v4-stack.mjs');

  for (const [role, expectation] of Object.entries(PLATFORM_EXPECT)) {
    test(`${role} — KYB admin + cross-tenant payment isolation`, async ({request}) => {
      const user = creds.platforms![role];
      const token = await apiLogin(request, creds.apiBase, user.email, user.password);
      const res = await apiJson(request, creds.apiBase, 'GET', '/api/v1/admin/kyb/cases', {token});
      expect(res.status).toBe(expectation.kybList);

      // Platform users without merchant org context must not invent tenant via header
      const tenantHeader = await request.get(`${creds.apiBase}/api/v1/merchant/payment-links`, {
        headers: {Authorization: `Bearer ${token}`, 'X-Tenant-ID': creds.owner.organization_id},
      });
      expect([401, 403]).toContain(tenantHeader.status());
    });
  }

  test('Merchant owner cannot call platform KYB admin list', async ({request}) => {
    const token = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
    const res = await apiJson(request, creds.apiBase, 'GET', '/api/v1/admin/kyb/cases', {token});
    expect(res.status).toBe(403);
  });
});

test.describe('Phase 6.6 cross-tenant API', () => {
  test('viewer org cannot read owner org payment links by guessing', async ({request}) => {
    const ownerToken = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
    const created = await apiJson(request, creds.apiBase, 'POST', '/api/v1/merchant/payment-links', {
      token: ownerToken,
      idempotent: true,
      data: {title: 'Tenant A', amount_mode: 'FIXED', amount_minor: '250', currency_code: 'SAR'},
    });
    expect(created.status).toBe(201);
    const linkId = created.body.data.id as string;

    const viewerToken = await apiLogin(request, creds.apiBase, creds.viewer.email, creds.viewer.password);
    const leak = await apiJson(request, creds.apiBase, 'GET', `/api/v1/merchant/payment-links/${linkId}`, {
      token: viewerToken,
    });
    expect([403, 404]).toContain(leak.status);
  });

  for (const resource of [
    {list: '/api/v1/customers', create: true},
    {list: '/api/v1/invoices', create: false},
    {list: '/api/v1/api-keys', create: false},
  ] as const) {
    test(`cross-tenant isolation on ${resource.list}`, async ({request}) => {
      const ownerToken = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
      const viewerToken = await apiLogin(request, creds.apiBase, creds.viewer.email, creds.viewer.password);
      const ownerList = await apiJson(request, creds.apiBase, 'GET', resource.list, {token: ownerToken});
      expect(ownerList.status).toBe(200);
      const first = (ownerList.body.data || [])[0];
      if (!first?.id) return;
      const leak = await apiJson(request, creds.apiBase, 'GET', `${resource.list}/${first.id}`, {
        token: viewerToken,
      });
      // list detail may 404 for isolation or 403; keys use /revoke not /:id GET
      if (resource.list.includes('api-keys')) {
        expect([403, 404, 405]).toContain(leak.status);
      } else {
        expect([403, 404]).toContain(leak.status);
      }
    });
  }
});
