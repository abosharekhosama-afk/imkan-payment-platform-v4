# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: role-matrix.spec.ts >> Phase 6.6 cross-tenant API >> cross-tenant isolation on /api/v1/api-keys
- Location: e2e\role-matrix.spec.ts:199:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  103 | };
  104 | 
  105 | test.describe('Phase 6.6 merchant role matrix', () => {
  106 |   test.skip(!creds.merchants, 'Stack credentials missing merchants map — restart e2e-v4-stack.mjs');
  107 | 
  108 |   for (const [role, expectation] of Object.entries(MERCHANT_EXPECT)) {
  109 |     test(`${role} — nav + forbidden + create hidden + API deny`, async ({page, request}) => {
  110 |       const user = creds.merchants![role] || (role === 'MERCHANT_OWNER' ? creds.owner : creds.viewer);
  111 |       await loginAs(page, user.email, user.password);
  112 | 
  113 |       for (const label of expectation.navIncludes) {
  114 |         await expect(page.getByRole('link', {name: label, exact: true}).first()).toBeVisible({timeout: 15_000});
  115 |       }
  116 |       for (const label of expectation.navExcludes) {
  117 |         await expect(page.getByRole('navigation').getByRole('link', {name: label, exact: true})).toHaveCount(0);
  118 |       }
  119 | 
  120 |       for (const pathName of expectation.deepLinksForbidden) {
  121 |         await page.goto(pathName);
  122 |         await expect(page.getByRole('heading', {name: /Access denied/i})).toBeVisible({timeout: 15_000});
  123 |       }
  124 | 
  125 |       for (const item of expectation.createHidden) {
  126 |         // Deep-link may already be forbidden — skip button assert if Access denied
  127 |         await page.goto(item.path);
  128 |         const denied = await page.getByRole('heading', {name: /Access denied/i}).count();
  129 |         if (denied === 0) {
  130 |           await expect(page.getByRole('button', {name: item.button})).toHaveCount(0);
  131 |         }
  132 |       }
  133 | 
  134 |       if (expectation.mutateDenies.length) {
  135 |         const token = await apiLogin(request, creds.apiBase, user.email, user.password);
  136 |         for (const deny of expectation.mutateDenies) {
  137 |           const res = await apiJson(request, creds.apiBase, deny.method, deny.path, {
  138 |             token,
  139 |             idempotent: true,
  140 |             data: deny.data,
  141 |           });
  142 |           expect([401, 403]).toContain(res.status);
  143 |         }
  144 |       }
  145 | 
  146 |       await logout(page);
  147 |     });
  148 |   }
  149 | });
  150 | 
  151 | test.describe('Phase 6.6 platform role matrix (API)', () => {
  152 |   test.skip(!creds.platforms, 'Stack credentials missing platforms map — restart e2e-v4-stack.mjs');
  153 | 
  154 |   for (const [role, expectation] of Object.entries(PLATFORM_EXPECT)) {
  155 |     test(`${role} — KYB admin + cross-tenant payment isolation`, async ({request}) => {
  156 |       const user = creds.platforms![role];
  157 |       const token = await apiLogin(request, creds.apiBase, user.email, user.password);
  158 |       const res = await apiJson(request, creds.apiBase, 'GET', '/api/v1/admin/kyb/cases', {token});
  159 |       expect(res.status).toBe(expectation.kybList);
  160 | 
  161 |       // Platform users without merchant org context must not invent tenant via header
  162 |       const tenantHeader = await request.get(`${creds.apiBase}/api/v1/merchant/payment-links`, {
  163 |         headers: {Authorization: `Bearer ${token}`, 'X-Tenant-ID': creds.owner.organization_id},
  164 |       });
  165 |       expect([401, 403]).toContain(tenantHeader.status());
  166 |     });
  167 |   }
  168 | 
  169 |   test('Merchant owner cannot call platform KYB admin list', async ({request}) => {
  170 |     const token = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
  171 |     const res = await apiJson(request, creds.apiBase, 'GET', '/api/v1/admin/kyb/cases', {token});
  172 |     expect(res.status).toBe(403);
  173 |   });
  174 | });
  175 | 
  176 | test.describe('Phase 6.6 cross-tenant API', () => {
  177 |   test('viewer org cannot read owner org payment links by guessing', async ({request}) => {
  178 |     const ownerToken = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
  179 |     const created = await apiJson(request, creds.apiBase, 'POST', '/api/v1/merchant/payment-links', {
  180 |       token: ownerToken,
  181 |       idempotent: true,
  182 |       data: {title: 'Tenant A', amount_mode: 'FIXED', amount_minor: '250', currency_code: 'SAR'},
  183 |     });
  184 |     expect(created.status).toBe(201);
  185 |     const linkId = created.body.data.id as string;
  186 | 
  187 |     const viewerToken = await apiLogin(request, creds.apiBase, creds.viewer.email, creds.viewer.password);
  188 |     const leak = await apiJson(request, creds.apiBase, 'GET', `/api/v1/merchant/payment-links/${linkId}`, {
  189 |       token: viewerToken,
  190 |     });
  191 |     expect([403, 404]).toContain(leak.status);
  192 |   });
  193 | 
  194 |   for (const resource of [
  195 |     {list: '/api/v1/customers', create: true},
  196 |     {list: '/api/v1/invoices', create: false},
  197 |     {list: '/api/v1/api-keys', create: false},
  198 |   ] as const) {
  199 |     test(`cross-tenant isolation on ${resource.list}`, async ({request}) => {
  200 |       const ownerToken = await apiLogin(request, creds.apiBase, creds.owner.email, creds.owner.password);
  201 |       const viewerToken = await apiLogin(request, creds.apiBase, creds.viewer.email, creds.viewer.password);
  202 |       const ownerList = await apiJson(request, creds.apiBase, 'GET', resource.list, {token: ownerToken});
> 203 |       expect(ownerList.status).toBe(200);
      |                                ^ Error: expect(received).toBe(expected) // Object.is equality
  204 |       const first = (ownerList.body.data || [])[0];
  205 |       if (!first?.id) return;
  206 |       const leak = await apiJson(request, creds.apiBase, 'GET', `${resource.list}/${first.id}`, {
  207 |         token: viewerToken,
  208 |       });
  209 |       // list detail may 404 for isolation or 403; keys use /revoke not /:id GET
  210 |       if (resource.list.includes('api-keys')) {
  211 |         expect([403, 404, 405]).toContain(leak.status);
  212 |       } else {
  213 |         expect([403, 404]).toContain(leak.status);
  214 |       }
  215 |     });
  216 |   }
  217 | });
  218 | 
```