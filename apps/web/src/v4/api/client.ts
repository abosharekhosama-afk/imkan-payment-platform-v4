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

/** CSRF for cookie sessions: sessionStorage first, then readable imkan_csrf cookie. */
export function getEffectiveCsrfToken(): string | null {
  const stored = getCsrfTokenFromDocument();
  if (stored) return stored;
  try {
    const match = document.cookie.match(/(?:^|;\s*)imkan_csrf=([^;]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    /* ignore */
  }
  return null;
}

export function storeCsrfToken(token: string | null | undefined) {
  try {
    if (token) sessionStorage.setItem('v4_csrf_token', token);
  } catch {
    /* ignore */
  }
}

async function refreshCsrfFromMe(token?: string | null): Promise<string | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader(token),
  };
  const res = await fetch(`${API_ORIGIN}${API_PREFIX}/auth/me`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const data = json && typeof json === 'object' && 'data' in json ? (json as any).data : json;
  const csrf = data?.csrf_token as string | undefined;
  if (csrf) storeCsrfToken(csrf);
  return csrf || null;
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
  const doFetch = async (csrfOverride?: string | null) => {
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

    const csrf = csrfOverride !== undefined ? csrfOverride : getEffectiveCsrfToken();
    if (csrf && method !== 'GET' && method !== 'HEAD') {
      headers['X-CSRF-Token'] = csrf;
    }

    return fetch(`${API_ORIGIN}${relative}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: 'include',
    });
  };

  let res = await doFetch();
  let json = await res.json().catch(() => ({}));

  // Cookie-session mutations can fail CSRF after API restart; refresh token once and retry.
  const errCode = (json as any)?.error?.code;
  if (
    !res.ok &&
    errCode === 'CSRF_INVALID' &&
    method !== 'GET' &&
    method !== 'HEAD' &&
    !relative.includes('/auth/me')
  ) {
    const fresh = await refreshCsrfFromMe(options.token);
    if (fresh) {
      res = await doFetch(fresh);
      json = await res.json().catch(() => ({}));
    }
  }

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
    const data = (json as {data: T}).data;
    if (data && typeof data === 'object' && (data as any).csrf_token) {
      storeCsrfToken((data as any).csrf_token);
    }
    return data;
  }
  return json as T;
}

export function checkoutWebUrl(publicToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/checkout/${publicToken}`;
}

export async function downloadApiV1(path: string, filename: string, token?: string | null) {
  assertV4Path(path);
  const relative = isApiV1Path(path) ? path : `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  assertV4Path(relative);

  const res = await fetch(`${API_ORIGIN}${relative}`, {
    method: 'GET',
    headers: authHeader(token),
    credentials: 'include',
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const err = (json as any)?.error;
    throw new ApiError(err?.message || res.statusText || 'Download failed', {
      code: err?.code,
      requestId: err?.request_id || res.headers.get('x-request-id') || undefined,
      status: res.status,
      details: err?.details,
    });
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export {API_ORIGIN, API_PREFIX};

/** Refresh CSRF for cookie sessions (e.g. before binary upload). */
export async function refreshCsrfForSession(token?: string | null): Promise<string | null> {
  return refreshCsrfFromMe(token);
}

/** PUT document binary with CSRF + cookie session support. */
export async function uploadDocumentBinary(
  token: string | null | undefined,
  documentId: string,
  file: File,
): Promise<unknown> {
  const relative = `${API_PREFIX}/merchant/documents/${documentId}/content`;
  assertV4Path(relative);

  const doPut = async (csrfOverride?: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      ...authHeader(token),
    };
    const cookieSession = !headers.Authorization;
    let csrf = csrfOverride !== undefined ? csrfOverride : getEffectiveCsrfToken();
    if (cookieSession && !csrf) {
      csrf = await refreshCsrfFromMe(token);
    }
    if (cookieSession && csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    return fetch(`${API_ORIGIN}${relative}`, {
      method: 'PUT',
      headers,
      body: file,
      credentials: 'include',
    });
  };

  let res = await doPut();
  let json = await res.json().catch(() => ({}));
  if (!res.ok && (json as any)?.error?.code === 'CSRF_INVALID') {
    const fresh = await refreshCsrfFromMe(token);
    if (fresh) {
      res = await doPut(fresh);
      json = await res.json().catch(() => ({}));
    }
  }
  if (!res.ok) {
    const err = (json as any)?.error || {};
    throw new ApiError(err.message || `Upload failed (${res.status})`, {
      code: err.code,
      requestId: err.request_id || (json as any)?.meta?.request_id,
      status: res.status,
      details: err.details,
    });
  }
  return (json as any).data ?? json;
}
