/**
 * Minimal cookie parse/set for Fastify (P15.2) — no external cookie package required.
 */
import type {FastifyInstance, FastifyReply, FastifyRequest} from 'fastify';

const cookiesByRequest = new WeakMap<FastifyRequest, Record<string, string>>();

function cookiesForRequest(request: FastifyRequest): Record<string, string> {
  let cookies = cookiesByRequest.get(request);
  if (!cookies) {
    cookies = parseCookieHeader(
      typeof request.headers.cookie === 'string' ? request.headers.cookie : undefined,
    );
    cookiesByRequest.set(request, cookies);
  }
  return cookies;
}

function parseCookieHeader(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function serializeCookie(
  name: string,
  value: string,
  opts: {
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none' | string;
    maxAge?: number;
  },
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  if (opts.sameSite) {
    const ss = String(opts.sameSite);
    parts.push(`SameSite=${ss.charAt(0).toUpperCase()}${ss.slice(1).toLowerCase()}`);
  }
  return parts.join('; ');
}

declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string>;
  }
  interface FastifyReply {
    setCookie(
      name: string,
      value: string,
      options?: {
        path?: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: 'lax' | 'strict' | 'none' | string;
        maxAge?: number;
        signed?: boolean;
      },
    ): FastifyReply;
    clearCookie(name: string, options?: {path?: string}): FastifyReply;
  }
}

export async function registerCookiePlugin(app: FastifyInstance) {
  app.decorateRequest('cookies', {
    getter(this: FastifyRequest) {
      return cookiesForRequest(this);
    },
    setter(this: FastifyRequest, value: Record<string, string>) {
      cookiesByRequest.set(this, value);
    },
  });

  app.decorateReply(
    'setCookie',
    function (
      this: FastifyReply,
      name: string,
      value: string,
      options?: {
        path?: string;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: 'lax' | 'strict' | 'none' | string;
        maxAge?: number;
        signed?: boolean;
      },
    ) {
      const prev = this.getHeader('Set-Cookie');
      const next = serializeCookie(name, value, options || {});
      if (!prev) this.header('Set-Cookie', next);
      else if (Array.isArray(prev)) this.header('Set-Cookie', [...prev.map(String), next]);
      else this.header('Set-Cookie', [String(prev), next]);
      return this;
    },
  );

  app.decorateReply('clearCookie', function (this: FastifyReply, name: string, options?: {path?: string}) {
    return this.setCookie(name, '', {path: options?.path || '/', maxAge: 0, httpOnly: true});
  });
}
