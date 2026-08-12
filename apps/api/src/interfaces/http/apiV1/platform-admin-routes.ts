import type {FastifyInstance, FastifyReply} from 'fastify';
import {z} from 'zod';
import {requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {ok, parsePaging} from '../../../foundation/http.js';
import {rateLimit} from '../../../foundation/rate-limit.js';
import {platformAdminService} from '../../../platform/platform-admin-service.js';

const platformOrgRead = ['platform.organizations.read', 'platform.admin', 'platform.support'] as const;
const platformOrgManage = ['platform.organizations.manage', 'platform.admin'] as const;
const platformObsRead = ['platform.audit_logs.read', 'platform.admin', 'platform.support'] as const;
const platformSystemRead = ['platform.system.manage', 'platform.admin', 'platform.support'] as const;
const platformWebhooksManage = ['webhooks.manage', 'platform.admin', 'platform.support'] as const;

function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
}

export async function registerPlatformAdminRoutes(app: FastifyInstance) {
  app.get(
    '/platform/organizations',
    {preHandler: [requirePermission(...platformOrgRead), rateLimit('providers.read')]},
    async (request, reply) => {
      const query = z
        .object({
          status: z.string().max(30).optional(),
          search: z.string().max(200).optional(),
          format: z.enum(['csv']).optional(),
        })
        .parse(request.query);
      if (query.format === 'csv') {
        return sendCsv(reply, 'organizations.csv', await platformAdminService.exportOrganizationsCsv());
      }
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listOrganizations({
          status: query.status,
          search: query.search,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.get(
    '/platform/organizations/:organizationId',
    {preHandler: [requirePermission(...platformOrgRead)]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      return ok(request, await platformAdminService.getOrganization(params.organizationId));
    },
  );

  app.patch(
    '/platform/organizations/:organizationId/status',
    {
      preHandler: [
        requirePermission(...platformOrgManage),
        requireStepUp('platform.organization.status'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      const body = z
        .object({
          status: z.enum(['ACTIVE', 'SUSPENDED']),
          reason: z.string().max(2000).optional().nullable(),
        })
        .parse(request.body);
      return ok(
        request,
        await platformAdminService.updateOrganizationStatus(
          params.organizationId,
          body.status,
          {userId: request.auth!.userId, requestId: request.id},
          body.reason,
        ),
      );
    },
  );

  app.patch(
    '/platform/organizations/:organizationId/settings',
    {preHandler: [requirePermission(...platformOrgManage), rateLimit('payment_links.write')]},
    async (request) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      const body = z
        .object({
          name: z.string().min(2).max(200).optional(),
          default_currency: z.string().length(3).optional().nullable(),
          locale: z.string().min(2).max(20).optional().nullable(),
          timezone: z.string().min(2).max(80).optional().nullable(),
        })
        .parse(request.body);
      return ok(
        request,
        await platformAdminService.updateOrganizationSettings(params.organizationId, body, {
          userId: request.auth!.userId,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    '/platform/organizations/:organizationId/payments',
    {preHandler: [requirePermission(...platformOrgRead, 'platform.payments.read'), rateLimit('providers.read')]},
    async (request, reply) => {
      const params = z.object({organizationId: z.string().uuid()}).parse(request.params);
      const query = z.object({status: z.string().max(30).optional(), format: z.enum(['csv']).optional()}).parse(request.query);
      if (query.format === 'csv') {
        return sendCsv(
          reply,
          `payments-${params.organizationId}.csv`,
          await platformAdminService.exportOrganizationPaymentsCsv(params.organizationId),
        );
      }
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listOrganizationPayments(params.organizationId, {
          status: query.status,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.get(
    '/platform/system/health',
    {preHandler: [requirePermission(...platformSystemRead)]},
    async (request) => ok(request, await platformAdminService.getSystemHealth()),
  );

  app.get(
    '/platform/webhook-deliveries',
    {preHandler: [requirePermission(...platformWebhooksManage, 'platform.payments.read'), rateLimit('providers.read')]},
    async (request) => {
      const query = z
        .object({
          organization_id: z.string().uuid().optional(),
          status: z.string().max(30).optional(),
        })
        .parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listWebhookDeliveries({
          organizationId: query.organization_id,
          status: query.status,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.post(
    '/platform/webhook-deliveries/:deliveryId/retry',
    {preHandler: [requirePermission(...platformWebhooksManage), rateLimit('payment_links.write')]},
    async (request) => {
      const params = z.object({deliveryId: z.string().uuid()}).parse(request.params);
      return ok(
        request,
        await platformAdminService.retryWebhookDelivery(params.deliveryId, request.auth!.userId),
      );
    },
  );

  app.post(
    '/platform/webhook-deliveries/retry-failed',
    {preHandler: [requirePermission(...platformWebhooksManage), rateLimit('payment_links.write')]},
    async (request) => {
      const body = z.object({organization_id: z.string().uuid().optional()}).parse(request.body || {});
      return ok(
        request,
        await platformAdminService.retryFailedWebhookDeliveries({
          organizationId: body.organization_id,
          actorUserId: request.auth!.userId,
        }),
      );
    },
  );

  app.get(
    '/platform/audit-events',
    {preHandler: [requirePermission(...platformObsRead), rateLimit('providers.read')]},
    async (request, reply) => {
      const query = z
        .object({
          organization_id: z.string().uuid().optional(),
          format: z.enum(['csv']).optional(),
        })
        .parse(request.query);
      if (query.format === 'csv') {
        return sendCsv(reply, 'audit-events.csv', await platformAdminService.exportAuditCsv(query.organization_id));
      }
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listAuditEvents({
          organizationId: query.organization_id,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.get(
    '/platform/security-events',
    {preHandler: [requirePermission(...platformObsRead), rateLimit('providers.read')]},
    async (request) => {
      const query = z.object({organization_id: z.string().uuid().optional()}).parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listSecurityEvents({
          organizationId: query.organization_id,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.get(
    '/platform/error-reports',
    {preHandler: [requirePermission(...platformObsRead), rateLimit('providers.read')]},
    async (request) => {
      const query = z.object({organization_id: z.string().uuid().optional()}).parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await platformAdminService.listErrorReports({
          organizationId: query.organization_id,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );
}
