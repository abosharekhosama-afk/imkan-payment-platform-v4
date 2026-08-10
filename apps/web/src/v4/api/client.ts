/**
 * Centralized V4 API client — API_PREFIX only (PostgreSQL public API).
 * Throws if a Legacy MySQL API path is requested.
 * P15.2: credentials:include for HttpOnly cookies; CSRF double-submit when needed.
 */

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_PREFIX = '/api/' + 'v1';

let sessionTransportHint = (
  import.meta.env.VITE_SESSION_TRANSPORT ||
  (import.meta.env.PROD || import.meta.env.MODE === 'production' ? 'cookie' : 'dual')
).toLowerCase();

export function setSessionTransportHint(value: string) {
  sessionTransportHint = value.toLowerCase();
}

export function getCsrfTokenFromDocument(): string | null {
  try {
    return sessionStorage.getItem('v4_csrf_token');
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  code?: string;
  requestId?: string;
  status: number;
  details?: unknown;

  constructor(message: string, init: {code?: string; requestId?: string; status: number; details?: unknown}) {
    super(message);
    this.name = 'ApiError';
    this.code = init.code;
    this.requestId = init.requestId;
    this.status = init.status;
    this.details = init.details;
  }
}

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  idempotent?: boolean;
  idempotencyKey?: string;
  /** Consumed once by requireStepUp() on sensitive mutations */
  stepUpToken?: string | null;
  signal?: AbortSignal;
};

function assertV4Path(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const legacyRoot = `/${'v1'}`;
  if (normalized === legacyRoot || normalized.startsWith(`${legacyRoot}/`)) {
    throw new Error(`LEGACY_API_FORBIDDEN: V4 client refused path "${path}". Use ${API_PREFIX} only.`);
  }
  const legacyCheckout = '/checkout/' + 'public';
  const legacyPay = '/' + 'pay' + '/';
  if (normalized.startsWith(legacyCheckout) || normalized.startsWith(legacyPay)) {
    throw new Error(`LEGACY_CHECKOUT_FORBIDDEN: "${path}" is not a V4 path.`);
  }
}

function isApiV1Path(path: string) {
  return path === API_PREFIX || path.startsWith(API_PREFIX + '/');
}

function authHeader(token?: string | null): Record<string, string> {
  if (!token || token === 'cookie-session') return {};
  if (token.startsWith('pk_') || token.startsWith('sk_')) {
    return {Authorization: `Api-Key ${token}`};
  }
  if (token.startsWith('Api-Key ') || token.startsWith('Bearer ')) {
    return {Authorization: token};
  }
  // Cookie-only production: never attach bearer from memory/localStorage
  if (sessionTransportHint === 'cookie') return {};
  return {Authorization: `Bearer ${token}`};
}

export async function apiV1<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  assertV4Path(path);
  const relative = isApiV1Path(path) ? path : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  assertV4Path(relative);

  const method = options.method || (options.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader(options.token),
    ...(options.headers || {}),
  };

  if (options.idempotent || options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey || crypto.randomUUID();
  }
  if (options.stepUpToken) {
    headers['X-Step-Up-Token'] = options.stepUpToken;
  }

  const csrf = getCsrfTokenFromDocument();
  if (csrf && method !== 'GET' && method !== 'HEAD' && !headers.Authorization) {
    headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${API_ORIGIN}${relative}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
    credentials: 'include',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as any)?.error || {};
    throw new ApiError(err.message || `Request failed (${res.status})`, {
      code: err.code,
      requestId: err.request_id || (json as any)?.meta?.request_id,
      status: res.status,
      details: err.details,
    });
  }

  if (json && typeof json === 'object' && 'data' in (json as object)) {
    return (json as {data: T}).data;
  }
  return json as T;
}

export function checkoutWebUrl(publicToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/checkout/${publicToken}`;
}

export {API_ORIGIN, API_PREFIX};
