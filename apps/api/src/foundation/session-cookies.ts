/**
 * Session cookie + CSRF helpers (P15.2).
 * Production dashboard uses HttpOnly Secure cookies; API keys stay header-based.
 * Bearer Authorization remains supported for programmatic clients and tests.
 */
import type {FastifyReply, FastifyRequest} from 'fastify';
import crypto from 'node:crypto';
import {config} from '../config.js';

export const SESSION_COOKIE_NAME = 'imkan_session';
export const CSRF_COOKIE_NAME = 'imkan_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export type SessionTransport = 'bearer' | 'cookie' | 'dual';

export function resolveSessionTransport(): SessionTransport {
  const explicit = (process.env.SESSION_TRANSPORT || '').toLowerCase().trim();
  if (explicit === 'bearer' || explicit === 'cookie' || explicit === 'dual') {
    if (config.isProduction && explicit === 'bearer') {
      // Allow bearer-only only when explicitly forced for break-glass — prefer dual/cookie.
      if (process.env.ALLOW_BEARER_ONLY_IN_PRODUCTION === 'true') return 'bearer';
      throw new Error(
        'SESSION_TRANSPORT=bearer is not allowed in production without ALLOW_BEARER_ONLY_IN_PRODUCTION=true. Use cookie or dual.',
      );
    }
    return explicit;
  }
  return config.isProduction ? 'cookie' : 'dual';
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  const sameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase() as 'lax' | 'strict' | 'none';
  return {
    path: '/',
    httpOnly: true,
    secure: config.isProduction || process.env.SESSION_COOKIE_SECURE === 'true',
    sameSite,
    maxAge: maxAgeSeconds,
    signed: false,
  } as const;
}

export function csrfCookieOptions(maxAgeSeconds: number) {
  return {
    path: '/',
    httpOnly: false, // double-submit readable by JS
    secure: config.isProduction || process.env.SESSION_COOKIE_SECURE === 'true',
    sameSite: (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase() as 'lax' | 'strict' | 'none',
    maxAge: maxAgeSeconds,
  } as const;
}

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function setSessionCookies(
  reply: FastifyReply,
  input: {accessToken: string; expiresAt: Date; csrfToken?: string},
) {
  const transport = resolveSessionTransport();
  if (transport === 'bearer') return null;

  const maxAge = Math.max(60, Math.floor((input.expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(SESSION_COOKIE_NAME, input.accessToken, sessionCookieOptions(maxAge));
  const csrf = input.csrfToken || createCsrfToken();
  reply.setCookie(CSRF_COOKIE_NAME, csrf, csrfCookieOptions(maxAge));
  return csrf;
}

/** Mint/refresh CSRF cookie for an existing cookie/dual session (e.g. GET /auth/me). */
export function refreshCsrfCookie(reply: FastifyReply, maxAgeSeconds = config.sessionTtlHours * 3600) {
  const transport = resolveSessionTransport();
  if (transport === 'bearer') return null;
  const csrf = createCsrfToken();
  reply.setCookie(CSRF_COOKIE_NAME, csrf, csrfCookieOptions(Math.max(60, maxAgeSeconds)));
  return csrf;
}

export function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, {path: '/'});
  reply.clearCookie(CSRF_COOKIE_NAME, {path: '/'});
}

export function readSessionTokenFromRequest(request: FastifyRequest): string | null {
  const cookies = ((request as any).cookies || {}) as Record<string, string>;
  const fromCookie = cookies?.[SESSION_COOKIE_NAME];
  if (fromCookie && typeof fromCookie === 'string' && fromCookie.length > 10) {
    return fromCookie;
  }
  return null;
}

export function requiresCsrf(request: FastifyRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const transport = resolveSessionTransport();
  if (transport === 'bearer') return false;
  // Cookie-authenticated browser sessions need CSRF; Authorization Bearer / Api-Key skip.
  const authHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';
  if (authHeader) return false;
  const cookieToken = readSessionTokenFromRequest(request);
  return Boolean(cookieToken);
}

export function assertCsrf(request: FastifyRequest) {
  if (!requiresCsrf(request)) return;
  const cookies = ((request as any).cookies || {}) as Record<string, string>;
  const cookieToken = cookies?.[CSRF_COOKIE_NAME];
  const headerToken = String(request.headers[CSRF_HEADER_NAME] || '');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    const err: any = new Error('CSRF token missing or invalid');
    err.statusCode = 403;
    err.code = 'CSRF_INVALID';
    throw err;
  }
}

/** Strip access_token from JSON body in cookie-only production responses. */
export function maybeOmitAccessToken<T extends Record<string, unknown>>(payload: T): T {
  const transport = resolveSessionTransport();
  if (transport !== 'cookie') return payload;
  if (!config.isProduction && process.env.FORCE_OMIT_ACCESS_TOKEN !== 'true') return payload;
  if (!('access_token' in payload)) return payload;
  const clone = {...payload};
  delete (clone as any).access_token;
  (clone as any).token_delivery = 'cookie';
  return clone;
}
