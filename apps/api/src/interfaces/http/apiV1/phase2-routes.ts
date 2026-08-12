import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {identityPhase2} from '../../../foundation/identity-phase2.js';
import {identityService} from '../../../foundation/identity-service.js';
import {platformUsersService} from '../../../foundation/platform-users-service.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {forbidden} from '../../../foundation/errors.js';
import {pgQuery} from '../../../infrastructure/db/postgres.js';
import {rateLimit} from '../../../foundation/rate-limit.js';

async function optionalAuth(request: any) {
  const header = String(request.headers.authorization || '');
  if (!header.toLowerCase().startsWith('bearer ')) return;
  try {
    const session = await identityService.resolveSession(header.slice(7).trim());
    request.auth = {
      userId: session.userId,
      email: session.email,
      organizationId: session.organizationId,
      permissions: session.permissions,
      roles: session.roles,
      sessionId: session.sessionId,
    };
  } catch {
    // public accept may proceed without auth for new users
  }
}

function assertOrgAccess(auth: {organizationId: string | null; permissions: string[]}, organizationId: string) {
  if (auth.organizationId !== organizationId && !auth.permissions.includes('platform.admin')) {
    throw forbidden('Cross-tenant access denied', 'CROSS_TENANT_DENIED');
  }
}

export async function registerPhase2Routes(app: FastifyInstance) {
  app.post('/auth/verify-email', {preHandler: [rateLimit('auth.email_verification')]}, async (request) => {
    const body = z.object({token: z.string().min(10)}).parse(request.body);
    return ok(request, await identityPhase2.verifyEmail(body.token));
  });

  app.post('/auth/resend-verification', {preHandler: [rateLimit('auth.email_verification')]}, async (request) => {
    const body = z.object({email: z.string().email()}).parse(request.body);
    return ok(request, await identityPhase2.resendVerification(body.email));
  });

  app.post('/auth/password/forgot', {preHandler: [rateLimit('auth.password_reset')]}, async (request) => {
    const body = z.object({email: z.string().email()}).parse(request.body);
    return ok(request, await identityPhase2.requestPasswordReset(body.email));
  });

  app.post('/auth/password/reset', {preHandler: [rateLimit('auth.password_reset'), idempotencyPreHandler('auth.password.reset')]}, async (request) => {
    try {
      const body = z.object({token: z.string().min(10), password: z.string().min(10).max(200)}).parse(request.body);
      const data = await identityPhase2.resetPassword(body.token, body.password);
      const payload = ok(request, data);
      await completeIdempotency(request, 200, payload);
      return payload;
    } catch (error) {
      await failIdempotency(request);
      throw error;
    }
  });

  app.post(
    '/auth/password/change',
    {preHandler: [requireStepUp(), idempotencyPreHandler('auth.password.change')]},
    async (request) => {
      try {
        const body = z
          .object({current_password: z.string().min(1), new_password: z.string().min(10).max(200)})
          .parse(request.body);
        const auth = request.auth!;
        const data = await identityPhase2.changePassword(
          auth.userId,
          auth.organizationId,
          body.current_password,
          body.new_password,
        );
        const payload = ok(request, data);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post('/auth/mfa/step-up', async (request) => {
    const body = z
      .object({
        totp: z.string().regex(/^\d{6}$/),
        purpose: z.string().min(1).max(120).optional(),
      })
      .parse(request.body);
    const auth = request.auth!;
    return ok(
      request,
      await identityPhase2.beginStepUp(auth.userId, auth.organizationId, body.totp, body.purpose || 'SENSITIVE'),
    );
  });

  app.post(
    '/invitations/accept',
    {preHandler: [optionalAuth, idempotencyPreHandler('invitation.accept')]},
    async (request) => {
      try {
        const body = z
          .object({
            token: z.string().min(10),
            password: z.string().min(10).max(200).optional(),
            name: z.string().min(1).max(200).optional(),
          })
          .parse(request.body);
        const data = await identityPhase2.acceptInvitation(body.token, {
          password: body.password,
          name: body.name,
          existingUserId: request.auth?.userId,
        });
        const payload = ok(request, data);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/organizations/:organizationId/invitations',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('invites.manage', 'users.manage', 'users.invite'),
        requireStepUp('users.invite'),
        rateLimit('users.invite'),
        idempotencyPreHandler('invitation.create'),
      ],
    },
    async (request, reply) => {
      try {
        const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
        const body = z
          .object({
            email: z.string().email(),
            role_code: z.enum([
              'MERCHANT_ADMIN',
              'MERCHANT_FINANCE',
              'MERCHANT_SUPPORT',
              'MERCHANT_DEVELOPER',
              'MERCHANT_VIEWER',
            ]),
          })
          .parse(request.body);
        const auth = request.auth!;
        assertOrgAccess(auth, params.organizationId);
        const data = await identityPhase2.createInvitation({
          organizationId: params.organizationId,
          actorUserId: auth.userId,
          email: body.email,
          roleCode: body.role_code,
          requestId: request.id,
        });
        const payload = {data, meta: {request_id: request.id}};
        await completeIdempotency(request, 201, payload);
        return created(reply, request, data);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.get(
    '/organizations/:organizationId/invitations',
    {preHandler: [requirePermission('invites.manage', 'users.read', 'platform.admin')]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      assertOrgAccess(request.auth!, params.organizationId);
      return ok(request, await identityPhase2.listInvitations(params.organizationId));
    },
  );

  app.post(
    '/organizations/:organizationId/invitations/:invitationId/revoke',
    {preHandler: [requirePermission('invites.manage', 'users.manage'), requireStepUp()]},
    async (request) => {
      const params = z
        .object({organizationId: z.string().uuid(), invitationId: z.string().uuid()})
        .parse(request.params);
      assertOrgAccess(request.auth!, params.organizationId);
      return ok(
        request,
        await identityPhase2.revokeInvitation(params.organizationId, params.invitationId, request.auth!.userId),
      );
    },
  );

  app.post(
    '/organizations/:organizationId/users/:userId/deactivate',
    {preHandler: [requirePermission('users.deactivate', 'users.manage'), requireStepUp()]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid(), userId: z.string().uuid()}).parse(request.params);
      assertOrgAccess(request.auth!, params.organizationId);
      return ok(
        request,
        await identityPhase2.deactivateUser(params.organizationId, params.userId, request.auth!.userId),
      );
    },
  );

  // ----------------------------------------------------------- platform team
  // Platform team members hold PLATFORM_* roles with no merchant organization (organization_id NULL).
  app.get(
    '/platform/users',
    {preHandler: [requirePermission('platform.users.read', 'platform.admin')]},
    async (request) => ok(request, await platformUsersService.listPlatformUsers()),
  );

  app.get(
    '/platform/invitations',
    {preHandler: [requirePermission('platform.users.read', 'platform.admin')]},
    async (request) => ok(request, await platformUsersService.listInvitations()),
  );

  app.post(
    '/platform/invitations',
    {
      preHandler: [
        requirePermission('platform.users.manage', 'platform.admin'),
        requireStepUp('platform.users.invite'),
        rateLimit('users.invite'),
        idempotencyPreHandler('platform.invitation.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            email: z.string().email(),
            role_code: z.enum(['PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE']),
          })
          .parse(request.body);
        const auth = request.auth!;
        const data = await platformUsersService.createInvitation({
          email: body.email,
          roleCode: body.role_code,
          actorUserId: auth.userId,
          requestId: request.id,
        });
        const payload = {data, meta: {request_id: request.id}};
        await completeIdempotency(request, 201, payload);
        return created(reply, request, data);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/platform/invitations/:invitationId/revoke',
    {preHandler: [requirePermission('platform.users.manage', 'platform.admin'), requireStepUp()]},
    async (request) => {
      const params = z.object({invitationId: z.string().uuid()}).parse(request.params);
      return ok(request, await platformUsersService.revokeInvitation(params.invitationId, request.auth!.userId));
    },
  );

  app.get(
    '/error-reports',
    {preHandler: [requireOrganizationContext(), requirePermission('errors.read', 'platform.admin')]},
    async (request) => {
      const auth = request.auth!;
      const {limit, offset} = parsePaging(request.query);
      const r = await pgQuery(
        `SELECT id, organization_id, user_id, request_id, method, route, status_code, error_code, message, created_at
         FROM error_reports
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [auth.organizationId, limit, offset],
      );
      return ok(request, r.rows, {limit, offset});
    },
  );
}
