import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {rateLimit} from '../../../foundation/rate-limit.js';
import {writeAuditEvent} from '../../../foundation/audit.js';
import {customerService} from '../../../billing/customer-service.js';
import {catalogService} from '../../../billing/catalog-service.js';
import {subscriptionService} from '../../../billing/subscription-service.js';
import {renewalService} from '../../../billing/renewal-service.js';

const minor = z.string().regex(/^\d{1,30}$/);

export async function registerPhase6Routes(app: FastifyInstance) {
  // ---- customers
  app.get(
    '/customers',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('customers.read', 'billing.manage', 'platform.admin'),
        rateLimit('payments.read'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await customerService.list(request.auth!.organizationId!, limit, offset), {limit, offset});
    },
  );

  app.post(
    '/customers',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('customers.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('customers.create'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            name: z.string().min(1).max(300),
            email: z.string().email().optional().nullable(),
            phone: z.string().max(40).optional().nullable(),
            default_payment_method_token: z.string().max(200).optional().nullable(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            external_customer_id: z.string().max(200).optional().nullable(),
            source_system: z.string().max(100).optional().nullable(),
          })
          .parse(request.body);
        const row = await customerService.create(request.auth!.organizationId!, {
          name: body.name,
          email: body.email,
          phone: body.phone,
          defaultPaymentMethodToken: body.default_payment_method_token,
          metadata: body.metadata,
          externalCustomerId: body.external_customer_id,
          sourceSystem: body.source_system,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
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

  app.get(
    '/customers/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('customers.read', 'billing.manage', 'platform.admin'),
        rateLimit('payments.read'),
      ],
    },
    async (request) => {
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      return ok(request, await customerService.get(request.auth!.organizationId!, params.id));
    },
  );

  app.patch(
    '/customers/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('customers.manage', 'billing.manage', 'platform.admin'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request) => {
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      const body = z
        .object({
          name: z.string().min(1).max(300).optional(),
          email: z.string().email().optional().nullable(),
          phone: z.string().max(40).optional().nullable(),
          external_customer_id: z.string().max(200).optional().nullable(),
          source_system: z.string().max(100).optional().nullable(),
          status: z.enum(['ACTIVE', 'DISABLED']).optional(),
        })
        .parse(request.body);
      return ok(
        request,
        await customerService.update(request.auth!.organizationId!, params.id, {
          name: body.name,
          email: body.email,
          phone: body.phone,
          externalCustomerId: body.external_customer_id,
          sourceSystem: body.source_system,
          status: body.status,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    '/customers/:id/payments',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('customers.read', 'payments.read', 'billing.manage', 'platform.admin'),
        rateLimit('payments.read'),
      ],
    },
    async (request) => {
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await customerService.listPayments(request.auth!.organizationId!, params.id, limit, offset),
        {limit, offset},
      );
    },
  );

  // ---- products / prices
  app.get(
    '/products',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('products.read', 'billing.manage', 'platform.admin'),
      ],
    },
    async (request) => ok(request, await catalogService.listProducts(request.auth!.organizationId!)),
  );

  app.post(
    '/products',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('products.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('products.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            name: z.string().min(1).max(300),
            code: z.string().max(80).optional().nullable(),
            description: z.string().max(2000).optional().nullable(),
            product_type: z.enum(['ONE_TIME', 'SUBSCRIPTION']).optional(),
          })
          .parse(request.body);
        const row = await catalogService.createProduct(request.auth!.organizationId!, {
          name: body.name,
          code: body.code,
          description: body.description,
          productType: body.product_type,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        });
        await completeIdempotency(request, 201, {data: row, meta: {request_id: request.id}});
        return created(reply, request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.get(
    '/prices',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('prices.read', 'billing.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const q = z.object({product_id: z.string().uuid().optional()}).parse(request.query);
      return ok(request, await catalogService.listPrices(request.auth!.organizationId!, q.product_id));
    },
  );

  app.post(
    '/prices',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('prices.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('prices.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            product_id: z.string().uuid(),
            currency_code: z.string().length(3),
            unit_amount_minor: minor,
            interval_unit: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).optional(),
            interval_count: z.number().int().min(1).max(3650).optional(),
            nickname: z.string().max(200).optional().nullable(),
          })
          .parse(request.body);
        const row = await catalogService.createPrice(request.auth!.organizationId!, {
          productId: body.product_id,
          currencyCode: body.currency_code,
          unitAmountMinor: body.unit_amount_minor,
          intervalUnit: body.interval_unit,
          intervalCount: body.interval_count,
          nickname: body.nickname,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        });
        await completeIdempotency(request, 201, {data: row, meta: {request_id: request.id}});
        return created(reply, request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  // ---- subscriptions
  app.get(
    '/subscriptions',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('subscriptions.read', 'billing.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await subscriptionService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.post(
    '/subscriptions',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission(
          'subscriptions.create',
          'subscriptions.manage',
          'billing.manage',
          'platform.admin',
        ),
        idempotencyPreHandler('subscriptions.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            customer_id: z.string().uuid(),
            price_id: z.string().uuid(),
            trial_days: z.number().int().min(0).max(3650).optional(),
            payment_method_token: z.string().max(200).optional().nullable(),
            cancel_at_period_end: z.boolean().optional(),
          })
          .parse(request.body);
        const row = await subscriptionService.create(request.auth!.organizationId!, {
          customerId: body.customer_id,
          priceId: body.price_id,
          trialDays: body.trial_days,
          paymentMethodToken: body.payment_method_token,
          cancelAtPeriodEnd: body.cancel_at_period_end,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        });
        await completeIdempotency(request, 201, {data: row, meta: {request_id: request.id}});
        return created(reply, request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/subscriptions/:id/pause',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('subscriptions.pause', 'subscriptions.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('subscriptions.pause'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await subscriptionService.pause(
          request.auth!.organizationId!,
          params.id,
          request.auth!.authKind === 'session' ? request.auth!.userId : null,
        );
        await completeIdempotency(request, 200, ok(request, row));
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/subscriptions/:id/resume',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('subscriptions.resume', 'subscriptions.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('subscriptions.resume'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await subscriptionService.resume(
          request.auth!.organizationId!,
          params.id,
          request.auth!.authKind === 'session' ? request.auth!.userId : null,
        );
        await completeIdempotency(request, 200, ok(request, row));
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/subscriptions/:id/cancel',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('subscriptions.cancel', 'subscriptions.manage', 'billing.manage', 'platform.admin'),
        idempotencyPreHandler('subscriptions.cancel'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({id: z.string().uuid()}).parse(request.params);
        const body = z.object({at_period_end: z.boolean().optional()}).parse(request.body || {});
        const row = await subscriptionService.cancel(request.auth!.organizationId!, params.id, {
          atPeriodEnd: body.at_period_end,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
        });
        await completeIdempotency(request, 200, ok(request, row));
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  // ---- invoices
  app.get(
    '/invoices',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('invoices.read', 'billing.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await renewalService.listInvoices(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.get(
    '/invoices/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('invoices.read', 'billing.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const params = z.object({id: z.string().uuid()}).parse(request.params);
      return ok(request, await renewalService.getInvoice(request.auth!.organizationId!, params.id));
    },
  );

  app.post(
    '/invoices/:id/collect',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('invoices.pay', 'invoices.manage', 'billing.manage', 'platform.admin'),
        requireStepUp('invoices.collect'),
        idempotencyPreHandler('invoices.collect'),
        rateLimit('checkout.payment'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({id: z.string().uuid()}).parse(request.params);
        const orgId = request.auth!.organizationId!;
        const row = await renewalService.collectInvoiceNow(orgId, params.id);
        await writeAuditEvent({
          organizationId: orgId,
          actorUserId: request.auth!.userId,
          action: 'invoice.collect',
          resourceType: 'invoice',
          resourceId: params.id,
          after: {result: row},
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

  // ---- worker tick (merchant/platform ops / tests)
  app.post(
    '/billing/renewals/run',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('billing.manage', 'platform.admin'),
        requireStepUp('billing.renewals.run'),
        idempotencyPreHandler('billing.renewals.run'),
      ],
    },
    async (request) => {
      try {
        const body = z.object({limit: z.number().int().min(1).max(100).optional()}).parse(request.body || {});
        // Merchant callers are always scoped to session org (F-01). Global run requires platform.admin.
        const isPlatform = (request.auth!.permissions || []).includes('platform.admin');
        const orgScope = isPlatform ? null : request.auth!.organizationId!;
        const row = await renewalService.processDueSubscriptions(body.limit || 25, orgScope);
        await writeAuditEvent({
          organizationId: request.auth!.organizationId,
          actorUserId: request.auth!.userId,
          action: 'billing.renewals.run',
          resourceType: 'billing_renewal',
          resourceId: orgScope || 'platform-global',
          after: {processed_count: Array.isArray(row) ? row.length : 0, organization_scoped: !isPlatform},
          requestId: request.id,
        });
        await completeIdempotency(request, 200, ok(request, {processed: row, organization_scoped: !isPlatform}));
        return ok(request, {processed: row, organization_scoped: !isPlatform});
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );
}
