import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {apiKeysService} from '../../../foundation/api-keys.js';
import {rateLimit} from '../../../foundation/rate-limit.js';
import {providerAdminService} from '../../../providers/provider-admin-service.js';
import {providerWebhookService} from '../../../providers/webhook-service.js';
import {AppError} from '../../../foundation/errors.js';
import {
  MERCHANT_WEBHOOK_EVENT_TYPES,
  merchantOutboundWebhooks,
} from '../../../webhooks/merchant-outbound-webhooks.js';

export async function registerPhase5Routes(app: FastifyInstance) {
  // ---------------------------------------------------------- providers (admin)

  app.get(
    '/providers',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => ok(request, await providerAdminService.listProviders()),
  );

  app.get(
    '/providers/:code/capabilities',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => {
      const params = z.object({code: z.string().min(2).max(64)}).parse(request.params);
      return ok(request, await providerAdminService.listCapabilities(params.code));
    },
  );

  app.get(
    '/provider-accounts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => ok(request, await providerAdminService.listAccounts(request.auth!.organizationId!)),
  );

  app.get(
    '/provider-routes',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => ok(request, await providerAdminService.listRoutes(request.auth!.organizationId!)),
  );

  app.post(
    '/provider-routes',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.manage', 'platform.admin'),
        requireStepUp('providers.credentials'),
        rateLimit('providers.read'),
      ],
    },
    async (request, reply) => {
      const body = z
        .object({
          environment: z.enum(['SANDBOX', 'LIVE']),
          provider_account_id: z.string().uuid(),
          currency_code: z.string().length(3).optional().nullable(),
          payment_method_type_code: z.string().max(64).optional().nullable(),
          priority: z.number().int().min(1).max(10000).optional(),
        })
        .parse(request.body);
      const row = await providerAdminService.upsertRoute({
        organizationId: request.auth!.organizationId!,
        environment: body.environment,
        providerAccountId: body.provider_account_id,
        currencyCode: body.currency_code,
        paymentMethodTypeCode: body.payment_method_type_code,
        priority: body.priority,
        actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
        requestId: request.id,
      });
      return created(reply, request, row);
    },
  );

  app.post(
    '/merchant/provider-accounts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.manage', 'platform.admin'),
        requireStepUp('providers.credentials'),
        rateLimit('providers.read'),
      ],
    },
    async (request, reply) => {
      const body = z
        .object({
          provider_code: z.enum(['stripe', 'paytabs', 'bop', 'sandbox']),
          environment: z.enum(['SANDBOX', 'LIVE']),
          display_name: z.string().min(2).max(120).optional(),
          set_default: z.boolean().optional(),
        })
        .parse(request.body);
      const row = await providerAdminService.createOrgAccount({
        organizationId: request.auth!.organizationId!,
        providerCode: body.provider_code,
        environment: body.environment,
        displayName: body.display_name,
        setDefault: body.set_default,
        actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
        requestId: request.id,
      });
      return created(reply, request, row);
    },
  );

  app.get(
    '/provider-webhooks',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      const rows = await providerWebhookService.listForOrg(request.auth!.organizationId!, limit, offset);
      return ok(request, rows, {limit, offset});
    },
  );

  // ---------------------------------------------------------- merchant outbound webhooks (P16.8)

  app.get(
    '/merchant/webhook-endpoints',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.read', 'webhooks.manage', 'developer.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => ok(request, await merchantOutboundWebhooks.listEndpoints(request.auth!.organizationId!)),
  );

  app.post(
    '/merchant/webhook-endpoints',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.manage', 'platform.admin'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request, reply) => {
      const body = z
        .object({
          url: z.string().url().max(2000),
          description: z.string().max(500).optional().nullable(),
          subscribed_events: z.array(z.string().max(80)).max(20).optional(),
        })
        .parse(request.body);
      const row = await merchantOutboundWebhooks.createEndpoint(request.auth!.organizationId!, {
        url: body.url,
        description: body.description,
        subscribedEvents: body.subscribed_events,
        actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
        requestId: request.id,
      });
      return created(reply, request, row);
    },
  );

  app.patch(
    '/merchant/webhook-endpoints/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.manage', 'platform.admin'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request) => {
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      const body = z
        .object({
          url: z.string().url().max(2000).optional(),
          description: z.string().max(500).optional().nullable(),
          subscribed_events: z.array(z.string().max(80)).max(20).optional(),
          status: z.enum(['ACTIVE', 'DISABLED']).optional(),
        })
        .parse(request.body);
      return ok(
        request,
        await merchantOutboundWebhooks.updateEndpoint(request.auth!.organizationId!, params.id, {
          url: body.url,
          description: body.description,
          subscribedEvents: body.subscribed_events,
          status: body.status,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    '/merchant/webhook-deliveries',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.read', 'webhooks.manage', 'developer.read', 'platform.admin'),
        rateLimit('providers.read'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await merchantOutboundWebhooks.listDeliveries(request.auth!.organizationId!, limit, offset),
        {limit, offset},
      );
    },
  );

  app.post(
    '/merchant/webhook-deliveries/:deliveryId/retry',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.manage', 'platform.admin'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request) => {
      const params = z.object({deliveryId: z.string().uuid()}).parse(request.params);
      return ok(
        request,
        await merchantOutboundWebhooks.retryDelivery(params.deliveryId, {
          organizationId: request.auth!.organizationId!,
          actorUserId: request.auth!.userId,
        }),
      );
    },
  );

  app.get(
    '/merchant/webhook-event-types',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('webhooks.read', 'webhooks.manage', 'developer.read', 'platform.admin'),
      ],
    },
    async (request) => ok(request, [...MERCHANT_WEBHOOK_EVENT_TYPES]),
  );

  // ---------------------------------------------------------- API keys

  app.get(
    '/api-keys',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('api_keys.read', 'platform.admin'),
        rateLimit('api_keys.manage'),
      ],
    },
    async (request) => ok(request, await apiKeysService.list(request.auth!.organizationId!)),
  );

  app.post(
    '/api-keys',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('api_keys.manage', 'platform.admin'),
        requireStepUp('api_keys.create'),
        rateLimit('api_keys.manage'),
      ],
    },
    async (request, reply) => {
      if (request.auth!.authKind === 'api_key') {
        throw new AppError('API_KEY_CANNOT_CREATE_KEYS', 'API keys cannot create other API keys', 403);
      }
      const body = z
        .object({
          name: z.string().min(1).max(200),
          environment: z.enum(['SANDBOX', 'LIVE']).default('SANDBOX'),
          scopes: z
            .array(
              z.enum([
                'payments.read',
                'payments.manage',
                'payment_links.read',
                'payment_links.manage',
                'providers.read',
                'webhooks.read',
                'customers.read',
                'customers.manage',
                'products.read',
                'products.manage',
                'prices.read',
                'prices.manage',
                'subscriptions.read',
                'subscriptions.manage',
                'invoices.read',
                'invoices.manage',
                'billing.manage',
              ]),
            )
            .min(1),
          expires_at: z.string().datetime().optional().nullable(),
        })
        .parse(request.body);
      const row = await apiKeysService.create({
        organizationId: request.auth!.organizationId!,
        name: body.name,
        environment: body.environment,
        scopes: body.scopes,
        createdByUserId: request.auth!.userId,
        expiresAt: body.expires_at || null,
        requestId: request.id,
      });
      return created(reply, request, row);
    },
  );

  app.post(
    '/api-keys/:id/revoke',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('api_keys.manage', 'platform.admin'),
        requireStepUp('api_keys.revoke'),
        rateLimit('api_keys.manage'),
      ],
    },
    async (request) => {
      if (request.auth!.authKind === 'api_key') {
        throw new AppError('API_KEY_CANNOT_REVOKE_KEYS', 'API keys cannot revoke API keys', 403);
      }
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      const row = await apiKeysService.revoke({
        organizationId: request.auth!.organizationId!,
        apiKeyId: params.id,
        actorUserId: request.auth!.userId,
        requestId: request.id,
      });
      return ok(request, row);
    },
  );

  // ---------------------------------------------------------- inbound webhooks (public)

  app.post(
    '/webhooks/providers/:providerCode',
    {
      config: {rawBody: true} as Record<string, unknown>,
      preHandler: [rateLimit('webhooks.ingress')],
    },
    async (request, reply) => {
      const params = z.object({providerCode: z.string().min(2).max(64)}).parse(request.params);
      const rawBody =
        typeof (request as any).rawBody === 'string'
          ? (request as any).rawBody
          : typeof request.body === 'string'
            ? request.body
            : JSON.stringify(request.body ?? {});

      const result = await providerWebhookService.ingest({
        providerCode: params.providerCode,
        headers: request.headers as Record<string, string | string[] | undefined>,
        rawBody,
        ip: request.ip,
      });

      if (result.status === 'DUPLICATE') {
        return reply.code(200).send(ok(request, result));
      }
      return reply.code(202).send(ok(request, result));
    },
  );
}
