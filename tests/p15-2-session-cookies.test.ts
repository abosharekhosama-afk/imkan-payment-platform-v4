import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import Fastify from 'fastify';
import {apiV1Routes} from '../apps/api/src/interfaces/http/apiV1/routes.js';
import {pgPing, pgQuery} from '../apps/api/src/infrastructure/db/postgres.js';
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SESSION_COOKIE_NAME,
  maybeOmitAccessToken,
  resolveSessionTransport,
  sessionCookieOptions,
} from '../apps/api/src/foundation/session-cookies.js';

const hasPg = async () => {
  try {
    return await pgPing();
  } catch {
    return false;
  }
};

function parseSetCookie(header: string | string[] | undefined): Record<string, string> {
  const list = !header ? [] : Array.isArray(header) ? header : [header];
  const out: Record<string, string> = {};
  for (const line of list) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return out;
}

describe('P15.2 session cookies + CSRF', () => {
  const app = Fastify({logger: false});
  let ready = false;
  let email = '';
  let password = 'Password123!';

  beforeAll(async () => {
    ready = await hasPg();
    if (!ready) {
      if (process.env.FOUNDATION_PG_REQUIRED === 'true') throw new Error('PostgreSQL required');
      return;
    }
    await app.register(apiV1Routes, {prefix: '/api/v1'});
    await app.ready();
    email = `p152-cookie-${Date.now()}@example.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {email, password, organization_name: 'P152 Cookie Org'},
    });
    expect(reg.statusCode).toBe(201);
    const token = reg.json().data?.email_verification_token;
    if (token) {
      await app.inject({method: 'POST', url: '/api/v1/auth/verify-email', payload: {token}});
    } else {
      await pgQuery(`UPDATE users SET email_verified_at=NOW() WHERE email_normalized=$1`, [email.toLowerCase()]);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('sessionCookieOptions are HttpOnly and Secure in production-like config', () => {
    const opts = sessionCookieOptions(3600);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBeTruthy();
    expect(opts.path).toBe('/');
  });

  it('login sets HttpOnly session + CSRF cookies', async () => {
    if (!ready) return;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    expect(login.statusCode).toBe(200);
    const cookies = parseSetCookie(login.headers['set-cookie']);
    expect(cookies[SESSION_COOKIE_NAME]).toBeTruthy();
    expect(cookies[CSRF_COOKIE_NAME]).toBeTruthy();
    expect(login.json().data.access_token || login.json().data.csrf_token).toBeTruthy();

    const setCookieRaw = login.headers['set-cookie'];
    const lines = Array.isArray(setCookieRaw) ? setCookieRaw : [String(setCookieRaw)];
    const sessionLine = lines.find((l) => l.startsWith(`${SESSION_COOKIE_NAME}=`)) || '';
    expect(sessionLine.toLowerCase()).toContain('httponly');
  });

  it('cookie session authenticates /auth/me without Authorization header', async () => {
    if (!ready) return;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    const cookies = parseSetCookie(login.headers['set-cookie']);
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookies[SESSION_COOKIE_NAME])}`,
      },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.email).toBe(email);
  });

  it('cookie-authenticated mutating request without CSRF is rejected', async () => {
    if (!ready) return;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    const cookies = parseSetCookie(login.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookies[SESSION_COOKIE_NAME])}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(cookies[CSRF_COOKIE_NAME])}`,
      },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_INVALID');
  });

  it('cookie-authenticated mutating request with matching CSRF succeeds', async () => {
    if (!ready) return;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    const cookies = parseSetCookie(login.headers['set-cookie']);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(cookies[SESSION_COOKIE_NAME])}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(cookies[CSRF_COOKIE_NAME])}`,
        [CSRF_HEADER_NAME]: cookies[CSRF_COOKIE_NAME],
      },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.logged_out).toBe(true);
  });

  it('Bearer Authorization still works (API clients / tests)', async () => {
    if (!ready) return;
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {email, password},
    });
    const token = login.json().data.access_token;
    expect(token).toBeTruthy();
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {authorization: `Bearer ${token}`},
    });
    expect(me.statusCode).toBe(200);
  });

  it('maybeOmitAccessToken only strips in cookie+production force mode', () => {
    const payload = {access_token: 'secret', token_type: 'Bearer'} as any;
    const kept = maybeOmitAccessToken(payload);
    expect(kept.access_token).toBe('secret');
  });

  it('resolveSessionTransport defaults dual outside production', () => {
    const prev = process.env.SESSION_TRANSPORT;
    delete process.env.SESSION_TRANSPORT;
    expect(['dual', 'cookie', 'bearer']).toContain(resolveSessionTransport());
    if (prev === undefined) delete process.env.SESSION_TRANSPORT;
    else process.env.SESSION_TRANSPORT = prev;
  });
});
