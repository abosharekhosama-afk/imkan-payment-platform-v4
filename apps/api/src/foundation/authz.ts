import type {FastifyReply, FastifyRequest} from 'fastify';
import {identityService} from './identity-service.js';
import {identityPhase2} from './identity-phase2.js';
import {forbidden, unauthorized, notFound} from './errors.js';
import type {AuthContext} from './http.js';
import {apiKeysService, extractApiKey} from './api-keys.js';
import {
  authHasAllPermissions,
  authHasPermission,
  MERCHANT_SYSTEM_ROLES,
  PERMISSIONS,
  PLATFORM_SYSTEM_ROLES,
  resolvePermissionCode,
} from './permissions-catalog.js';
import {assertCsrf, readSessionTokenFromRequest} from './session-cookies.js';
import {incrMetric} from '../observability/metrics.js';

const PUBLIC_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/metrics',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/auth/password/forgot',
  '/api/v1/auth/password/reset',
  '/api/v1/invitations/accept',
  '/api/v1/platform/runtime',
]);

/** Public hosted-checkout routes (Phase 4) — token-scoped, no customer account. */
const PUBLIC_PATH_PREFIXES = ['/api/v1/checkout/'];

/** Inbound provider webhooks (Phase 5) — signature-verified, no session. */
const PUBLIC_WEBHOOK_PREFIX = '/api/v1/webhooks/providers/';

function isPublicPath(path: string): boolean {
  if (PUBLIC_PATHS.has(path)) return true;
  if (path.startsWith(PUBLIC_WEBHOOK_PREFIX)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

export async function apiV1AuthHook(request: FastifyRequest, _reply: FastifyReply) {
  const path = request.url.split('?')[0];
  if (isPublicPath(path)) return;

  if (request.headers['x-tenant-id']) {
    throw forbidden('X-Tenant-ID is not accepted on /api/v1', 'TENANT_HEADER_FORBIDDEN');
  }

  const authHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined;
  const xApiKey = typeof request.headers['x-api-key'] === 'string' ? request.headers['x-api-key'] : undefined;
  const apiKeySecret = extractApiKey(authHeader, xApiKey);

  if (apiKeySecret) {
    const key = await apiKeysService.resolveSecret(apiKeySecret);
    const auth: AuthContext = {
      userId: `api-key:${key.apiKeyId}`,
      email: '',
      organizationId: key.organizationId,
      permissions: key.permissions,
      roles: ['API_KEY'],
      sessionId: `api-key:${key.apiKeyId}`,
      apiKeyId: key.apiKeyId,
      authKind: 'api_key',
      apiKeyEnvironment: key.environment,
    };
    request.auth = auth;
    return;
  }

  // Prefer Authorization Bearer; fall back to HttpOnly session cookie (P15.2).
  const token = extractBearer(authHeader) || readSessionTokenFromRequest(request);
  if (!token) throw unauthorized();

  try {
    assertCsrf(request);
  } catch (error: any) {
    incrMetric('csrf_failures_total');
    throw forbidden(error?.message || 'CSRF token missing or invalid', 'CSRF_INVALID');
  }

  const session = await identityService.resolveSession(token);
  const auth: AuthContext = {
    userId: session.userId,
    email: session.email,
    organizationId: session.organizationId,
    permissions: session.permissions,
    roles: session.roles,
    sessionId: session.sessionId,
    authKind: 'session',
  };
  request.auth = auth;
}

/** OR semantics — any listed permission (aliases resolved). */
export function requirePermission(...codes: string[]) {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const resolved = codes.map(resolvePermissionCode);
    if (!authHasPermission(request.auth.permissions, ...resolved)) {
      throw forbidden(`Missing permission: ${resolved.join(' or ')}`);
    }
  };
}

/** AND semantics — all listed permissions required. */
export function requireAllPermissions(...codes: string[]) {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const resolved = codes.map(resolvePermissionCode);
    if (!authHasAllPermissions(request.auth.permissions, ...resolved)) {
      throw forbidden(`Missing permissions: ${resolved.join(' and ')}`);
    }
  };
}

/** Alias used by Phase 6.6 brief — same as requirePermission (OR). */
export const authorize = requirePermission;

export function requireOrganizationMembership() {
  return requireOrganizationContext();
}

/**
 * Optional role check. Prefer permissions for AuthZ; roles are for coarse gates only.
 * Platform roles never satisfy merchant role requirements and vice versa.
 */
export function requireRole(...roleCodes: string[]) {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const roles = request.auth.roles || [];
    if (!roleCodes.some((r) => roles.includes(r))) {
      throw forbidden(`Missing role: ${roleCodes.join(' or ')}`);
    }
  };
}

/**
 * Company owner controls for member/invite lifecycle, with platform owner/admin override.
 */
export function requireMerchantOwnerOrPlatformAdmin() {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const roles = request.auth.roles || [];
    if (
      roles.includes('MERCHANT_OWNER') ||
      roles.includes('PLATFORM_OWNER') ||
      authHasPermission(request.auth.permissions, PERMISSIONS.PLATFORM_ADMIN)
    ) {
      return;
    }
    throw forbidden('Only the company owner or platform admin can perform this action', 'OWNER_REQUIRED');
  };
}

/** Platform owner or platform.admin for sensitive platform-user / TOTP approval actions. */
export function requirePlatformOwnerOrAdmin() {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const roles = request.auth.roles || [];
    if (roles.includes('PLATFORM_OWNER') || authHasPermission(request.auth.permissions, PERMISSIONS.PLATFORM_ADMIN)) {
      return;
    }
    throw forbidden('Platform owner or platform admin required', 'PLATFORM_OWNER_REQUIRED');
  };
}

/** Ensures caller has a platform-scoped role (not merely a high merchant role). */
export function requirePlatformRole(...roleCodes: string[]) {
  const allowed = roleCodes.length ? roleCodes : [...PLATFORM_SYSTEM_ROLES];
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const roles = request.auth.roles || [];
    const ok = allowed.some((r) => roles.includes(r));
    if (!ok && !authHasPermission(request.auth.permissions, PERMISSIONS.PLATFORM_ADMIN)) {
      throw forbidden('Platform role required', 'PLATFORM_ROLE_REQUIRED');
    }
  };
}

export function requireOrganizationContext() {
  return async (request: FastifyRequest) => {
    if (!request.auth?.organizationId) {
      throw forbidden('Organization context required', 'ORG_CONTEXT_REQUIRED');
    }
  };
}

/**
 * Resource-level authorization: permission already checked separately;
 * ensure resource belongs to session organization (or platform override).
 * Uses 404 to avoid cross-tenant existence leaks when hideNotFound=true (default).
 */
export function authorizeResource(opts: {
  resourceOrganizationId: string | null | undefined;
  hideNotFound?: boolean;
  allowPlatform?: boolean;
}) {
  const hide = opts.hideNotFound !== false;
  const allowPlatform = opts.allowPlatform !== false;
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    const sessionOrg = request.auth.organizationId;
    const resourceOrg = opts.resourceOrganizationId;
    if (
      allowPlatform &&
      authHasPermission(
        request.auth.permissions,
        PERMISSIONS.PLATFORM_ADMIN,
        PERMISSIONS.PLATFORM_SUPPORT,
        PERMISSIONS.PLATFORM_ORGANIZATIONS_READ,
      )
    ) {
      return;
    }
    if (!sessionOrg || !resourceOrg || sessionOrg !== resourceOrg) {
      if (hide) throw notFound('Resource not found');
      throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
    }
  };
}

/** Assert helper for services (non-middleware). */
export function assertSameOrganization(
  sessionOrgId: string | null | undefined,
  resourceOrgId: string | null | undefined,
  opts?: {hideNotFound?: boolean},
) {
  const hide = opts?.hideNotFound !== false;
  if (!sessionOrgId || !resourceOrgId || sessionOrgId !== resourceOrgId) {
    if (hide) throw notFound('Resource not found');
    throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
  }
}

/** Requires X-Step-Up-Token bound to sensitive operation purpose */
export function requireStepUp(sensitiveOpCode?: string) {
  return async (request: FastifyRequest) => {
    if (!request.auth) throw unauthorized();
    if (request.auth.authKind === 'api_key') {
      throw forbidden('Step-up is not available for API keys', 'STEP_UP_NOT_AVAILABLE');
    }
    const token = String(request.headers['x-step-up-token'] || '').trim();
    if (!token) throw forbidden('Valid step-up token required', 'STEP_UP_REQUIRED');
    const purpose = sensitiveOpCode || 'SENSITIVE';
    await identityPhase2.consumeStepUpToken(
      request.auth.userId,
      token,
      purpose,
      request.auth.organizationId || null,
    );
  };
}

export function isMerchantSystemRole(code: string): boolean {
  return (MERCHANT_SYSTEM_ROLES as readonly string[]).includes(code);
}

export function isPlatformSystemRole(code: string): boolean {
  return (PLATFORM_SYSTEM_ROLES as readonly string[]).includes(code);
}
