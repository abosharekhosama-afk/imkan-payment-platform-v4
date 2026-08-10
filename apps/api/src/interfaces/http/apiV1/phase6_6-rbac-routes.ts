import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {
  requireOrganizationContext,
  requirePermission,
  requireStepUp,
} from '../../../foundation/authz.js';
import {created, ok} from '../../../foundation/http.js';
import {customRolesService} from '../../../foundation/custom-roles-service.js';
import {PERMISSION_DEFINITIONS} from '../../../foundation/permissions-catalog.js';
import {SENSITIVE_OPERATIONS} from '../../../foundation/sensitive-operations.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';

export async function registerPhase66RbacRoutes(app: FastifyInstance) {
  app.get(
    '/rbac/permissions',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.read', 'users.read', 'org.read', 'platform.admin'),
      ],
    },
    async (request) => {
      return ok(
        request,
        PERMISSION_DEFINITIONS.filter((p) => p.status !== 'alias').map((p) => ({
          code: p.code,
          description: p.description,
          status: p.status,
          scope: p.scope,
        })),
      );
    },
  );

  app.get(
    '/rbac/sensitive-operations',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.read', 'security.read', 'platform.admin'),
      ],
    },
    async (request) => ok(request, SENSITIVE_OPERATIONS),
  );

  app.get(
    '/rbac/roles',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.read', 'users.read', 'org.read', 'platform.admin'),
      ],
    },
    async (request) => ok(request, await customRolesService.list(request.auth!.organizationId!)),
  );

  app.post(
    '/rbac/roles',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.manage'),
        requireStepUp('roles.custom.manage'),
        idempotencyPreHandler('rbac.role.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            name: z.string().min(2).max(80),
            description: z.string().max(500).optional(),
            permissions: z.array(z.string().min(3).max(80)).min(1).max(200),
          })
          .parse(request.body);
        const auth = request.auth!;
        const row = await customRolesService.create({
          organizationId: auth.organizationId!,
          actorUserId: auth.userId,
          actorPermissions: auth.permissions,
          name: body.name,
          description: body.description,
          permissions: body.permissions,
          requestId: request.id,
        });
        const payload = {data: row, meta: {request_id: request.id}};
        await completeIdempotency(request, 201, payload);
        return created(reply, request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.put(
    '/rbac/roles/:roleId/permissions',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.manage'),
        requireStepUp('roles.custom.manage'),
        idempotencyPreHandler('rbac.role.update'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({roleId: z.string().uuid()}).parse(request.params);
        const body = z.object({permissions: z.array(z.string().min(3).max(80)).max(200)}).parse(request.body);
        const auth = request.auth!;
        const row = await customRolesService.updatePermissions({
          organizationId: auth.organizationId!,
          roleId: params.roleId,
          actorUserId: auth.userId,
          actorPermissions: auth.permissions,
          permissions: body.permissions,
          requestId: request.id,
        });
        await completeIdempotency(request, 200, ok(request, row));
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.delete(
    '/rbac/roles/:roleId',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.manage'),
        requireStepUp('roles.custom.manage'),
      ],
    },
    async (request) => {
      const params = z.object({roleId: z.string().uuid()}).parse(request.params);
      const auth = request.auth!;
      return ok(
        request,
        await customRolesService.remove({
          organizationId: auth.organizationId!,
          roleId: params.roleId,
          actorUserId: auth.userId,
          requestId: request.id,
        }),
      );
    },
  );

  app.post(
    '/rbac/users/:userId/assign-role',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('roles.manage', 'users.manage'),
        requireStepUp('roles.assign'),
        idempotencyPreHandler('rbac.role.assign'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({userId: z.string().uuid()}).parse(request.params);
        const body = z.object({role_code: z.string().min(3).max(80)}).parse(request.body);
        const auth = request.auth!;
        const row = await customRolesService.assignUserRole({
          organizationId: auth.organizationId!,
          userId: params.userId,
          roleCode: body.role_code,
          actorUserId: auth.userId,
          actorPermissions: auth.permissions,
          actorRoles: auth.roles,
          requestId: request.id,
        });
        await completeIdempotency(request, 200, ok(request, row));
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );
}
