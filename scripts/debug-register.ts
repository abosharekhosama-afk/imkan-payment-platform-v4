import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {closePgPool, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {identityService} from '../apps/api/src/foundation/identity-service.js';

async function main() {
  const roles = await pgQuery('SELECT code FROM roles ORDER BY code');
  console.log('roles', roles.rows);
  try {
    const direct = await identityService.register({
      email: `dbg-${Date.now()}@example.test`,
      password: 'SecurePass!123',
      organizationName: 'Dbg Org',
      name: 'Dbg',
      requestId: 'debug-1',
    });
    console.log('direct register ok', direct);
  } catch (error) {
    console.error('direct register failed', error);
  }

  const app = Fastify({logger: true});
  await app.register(apiV1Routes, {prefix: '/api/v1'});
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: `dbg2-${Date.now()}@example.test`,
      password: 'SecurePass!123',
      organization_name: 'Dbg Org 2',
      name: 'Dbg2',
    },
  });
  console.log('STATUS', res.statusCode);
  console.log(res.body);
  await app.close();
  await closePgPool();
}

main().catch(async (error) => {
  console.error(error);
  await closePgPool().catch(() => undefined);
  process.exit(1);
});
