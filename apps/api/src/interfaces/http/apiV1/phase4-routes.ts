import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission} from '../../../foundation/authz.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {paymentConfigService} from '../../../payments/payment-config-service.js';
import {paymentLinksService} from '../../../payments/payment-links-service.js';
import {paymentCoreService} from '../../../payments/payment-core-service.js';
import {merchantReadinessService} from '../../../payments/merchant-readiness-service.js';
import {dashboardSummaryService} from '../../../payments/dashboard-summary-service.js';
import {rateLimitPrep} from '../../../payments/rate-limit-prep.js';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable();
const minor = z.string().regex(/^\d{1,30}$/);

export async function registerPhase4Routes(app: FastifyInstance) {
  // ---------------------------------------------------------- payment config

  app.get(
    '/merchant/payment-config',
    {preHandler: [requireOrganizationContext(), requirePermission('payment_config.read'), rateLimitPrep('payments.read')]},
    async (request) => ok(request, await paymentConfigService.get(request.auth!.organizationId!)),
  );

  app.put(
    '/merchant/payment-config',
    {preHandler: [requireOrganizationContext(), requirePermission('payment_config.manage')]},
    async (request) => {
      const body = z
        .object({
          company_display_name: z.string().max(300).optional().nullable(),
          logo_url: z.string().url().max(1000).optional().nullable(),
          brand_primary_color: color,
          brand_secondary_color: color,
          description: z.string().max(4000).optional().nullable(),
          support_email: z.string().email().optional().nullable(),
          support_phone: z.string().max(40).optional().nullable(),
          checkout_theme: z.record(z.string(), z.unknown()).optional(),
          default_success_url: z.string().url().max(1000).optional().nullable(),
          default_cancel_url: z.string().url().max(1000).optional().nullable(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body);
      const row = await paymentConfigService.upsert(
        request.auth!.organizationId!,
        {
          companyDisplayName: body.company_display_name,
          logoUrl: body.logo_url,
          brandPrimaryColor: body.brand_primary_color,
          brandSecondaryColor: body.brand_secondary_color,
          description: body.description,
          supportEmail: body.support_email,
          supportPhone: body.support_phone,
          checkoutTheme: body.checkout_theme,
          defaultSuccessUrl: body.default_success_url,
          defaultCancelUrl: body.default_cancel_url,
          metadata: body.metadata,
        },
        {userId: request.auth!.userId, requestId: request.id},
      );
      return ok(request, row);
    },
  );

  // ---------------------------------------------------------- payment links

  app.get(
    '/merchant/payment-links',
    {preHandler: [requireOrganizationContext(), requirePermission('payment_links.read'), rateLimitPrep('payments.read')]},
    async (request) => {
      const query = z.object({status: z.string().max(30).optional()}).parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await paymentLinksService.list(request.auth!.organizationId!, {status: query.status, limit, offset}),
        {limit, offset},
      );
    },
  );

  app.post(
    '/merchant/payment-links',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payment_links.manage'),
        rateLimitPrep('payment_links.write'),
        idempotencyPreHandler('payment_link.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            title: z.string().min(1).max(300),
            description: z.string().max(4000).optional(),
            amount_mode: z.enum(['FIXED', 'CUSTOMER_ENTERED']),
            amount_minor: minor.optional(),
            currency_code: z.string().length(3),
            reference: z.string().max(200).optional(),
            expires_at: z.string().datetime({offset: true}).optional().nullable(),
            max_uses: z.number().int().min(1).max(1_000_000).optional().nullable(),
            one_time: z.boolean().optional(),
            reusable: z.boolean().optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
            activate: z.boolean().optional(),
            external_invoice_ref: z.string().max(200).optional().nullable(),
            success_url: z.string().url().max(1000).optional().nullable(),
            cancel_url: z.string().url().max(1000).optional().nullable(),
          })
          .parse(request.body);
        const row = await paymentLinksService.create(
          request.auth!.organizationId!,
          {
            title: body.title,
            description: body.description,
            amountMode: body.amount_mode,
            amountMinor: body.amount_minor,
            currencyCode: body.currency_code,
            reference: body.reference,
            expiresAt: body.expires_at,
            maxUses: body.max_uses,
            oneTime: body.one_time,
            reusable: body.reusable,
            metadata: body.metadata,
            activate: body.activate,
            externalInvoiceRef: body.external_invoice_ref,
            successUrl: body.success_url,
            cancelUrl: body.cancel_url,
          },
          {userId: request.auth!.userId, requestId: request.id},
        );
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
    '/merchant/payment-links/:linkId',
    {preHandler: [requireOrganizationContext(), requirePermission('payment_links.read')]},
    async (request) => {
      const params = z.object({linkId: z.string().uuid()}).parse(request.params);
      return ok(request, await paymentLinksService.get(request.auth!.organizationId!, params.linkId));
    },
  );

  app.patch(
    '/merchant/payment-links/:linkId',
    {preHandler: [requireOrganizationContext(), requirePermission('payment_links.manage')]},
    async (request) => {
      const params = z.object({linkId: z.string().uuid()}).parse(request.params);
      const body = z
        .object({
          title: z.string().min(1).max(300).optional(),
          description: z.string().max(4000).optional().nullable(),
          amount_minor: minor.optional().nullable(),
          reference: z.string().max(200).optional().nullable(),
          expires_at: z.string().datetime({offset: true}).optional().nullable(),
          max_uses: z.number().int().min(1).max(1_000_000).optional().nullable(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body);
      return ok(
        request,
        await paymentLinksService.update(
          request.auth!.organizationId!,
          params.linkId,
          {
            title: body.title,
            description: body.description,
            amountMinor: body.amount_minor,
            reference: body.reference,
            expiresAt: body.expires_at,
            maxUses: body.max_uses,
            metadata: body.metadata,
          },
          {userId: request.auth!.userId, requestId: request.id},
        ),
      );
    },
  );

  for (const action of ['activate', 'deactivate', 'cancel', 'expire', 'reuse'] as const) {
    app.post(
      `/merchant/payment-links/:linkId/${action}`,
      {preHandler: [requireOrganizationContext(), requirePermission('payment_links.manage')]},
      async (request) => {
        const params = z.object({linkId: z.string().uuid()}).parse(request.params);
        const actor = {userId: request.auth!.userId, requestId: request.id};
        const org = request.auth!.organizationId!;
        const row =
          action === 'activate'
            ? await paymentLinksService.activate(org, params.linkId, actor)
            : action === 'deactivate'
              ? await paymentLinksService.deactivate(org, params.linkId, actor)
              : action === 'cancel'
                ? await paymentLinksService.cancel(org, params.linkId, actor)
                : action === 'expire'
                  ? await paymentLinksService.expire(org, params.linkId, actor)
                  : await paymentLinksService.reuse(org, params.linkId, actor);
        return ok(request, row);
      },
    );
  }

  // --------------------------------------------------------------- payments

  app.get(
    '/merchant/dashboard/summary',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.read', 'platform.admin', 'platform.support'),
        rateLimitPrep('payments.read'),
      ],
    },
    async (request) => ok(request, await dashboardSummaryService.getSummary(request.auth!.organizationId!)),
  );

  app.get(
    '/merchant/payments/readiness',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.read', 'org.read'),
        rateLimitPrep('payments.read'),
      ],
    },
    async (request) =>
      ok(
        request,
        await merchantReadinessService.getPaymentsReadiness(
          request.auth!.organizationId!,
          request.auth!.userId,
        ),
      ),
  );

  app.get(
    '/merchant/transactions',
    {preHandler: [requireOrganizationContext(), requirePermission('payments.read'), rateLimitPrep('payments.read')]},
    async (request) => {
      const query = z
        .object({
          status: z.enum(['SUCCEEDED', 'FAILED']).optional(),
          provider_code: z.string().max(64).optional(),
        })
        .parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await paymentCoreService.listTransactions(request.auth!.organizationId!, {
          status: query.status,
          providerCode: query.provider_code,
          limit,
          offset,
        }),
        {limit, offset},
      );
    },
  );

  app.get(
    '/merchant/payments',
    {preHandler: [requireOrganizationContext(), requirePermission('payments.read'), rateLimitPrep('payments.read')]},
    async (request) => {
      const query = z.object({status: z.string().max(30).optional()}).parse(request.query);
      const {limit, offset} = parsePaging(request.query);
      return ok(
        request,
        await paymentCoreService.listPayments(request.auth!.organizationId!, {status: query.status, limit, offset}),
        {limit, offset},
      );
    },
  );

  app.get(
    '/merchant/payments/:paymentId',
    {preHandler: [requireOrganizationContext(), requirePermission('payments.read')]},
    async (request) => {
      const params = z.object({paymentId: z.string().uuid()}).parse(request.params);
      return ok(request, await paymentCoreService.getPayment(request.auth!.organizationId!, params.paymentId));
    },
  );

  app.post(
    '/merchant/payments/:paymentId/cancel',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.cancel', 'payments.manage'),
        idempotencyPreHandler('payment.cancel'),
      ],
    },
    async (request) => {
      try {
        const params = z.object({paymentId: z.string().uuid()}).parse(request.params);
        const body = z.object({reason: z.string().max(2000).optional()}).parse(request.body || {});
        const row = await paymentCoreService.cancelPayment(
          request.auth!.organizationId!,
          params.paymentId,
          {userId: request.auth!.userId, requestId: request.id},
          body.reason,
        );
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  // -------------------------------------------------------- public checkout

  app.post(
    '/checkout/stripe/sync',
    {preHandler: [rateLimitPrep('checkout.payment'), idempotencyPreHandler('checkout.stripe.sync')]},
    async (request) => {
      try {
        const body = z
          .object({
            payment_intent: z.string().min(3).max(200),
          })
          .parse(request.body || {});
        const row = await paymentCoreService.syncStripeCheckoutPayment(body.payment_intent);
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.get(
    '/checkout/:token',
    {preHandler: [rateLimitPrep('checkout.read')]},
    async (request) => {
      const params = z.object({token: z.string().min(16).max(200)}).parse(request.params);
      return ok(request, await paymentCoreService.getCheckoutPage(params.token));
    },
  );

  app.post(
    '/checkout/:token/session',
    {preHandler: [rateLimitPrep('checkout.session'), idempotencyPreHandler('checkout.session')]},
    async (request, reply) => {
      try {
        const params = z.object({token: z.string().min(16).max(200)}).parse(request.params);
        const body = z
          .object({
            amount_minor: minor.optional(),
            customer_name: z.string().max(300).optional(),
            customer_email: z.string().email().optional(),
            customer_phone: z.string().max(40).optional(),
            success_url: z.string().url().max(1000).optional(),
            cancel_url: z.string().url().max(1000).optional(),
            metadata: z.record(z.string(), z.unknown()).optional(),
          })
          .parse(request.body || {});
        const row = await paymentCoreService.createCheckoutSession(params.token, {
          amountMinor: body.amount_minor,
          customerName: body.customer_name,
          customerEmail: body.customer_email,
          customerPhone: body.customer_phone,
          successUrl: body.success_url,
          cancelUrl: body.cancel_url,
          metadata: body.metadata,
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
    '/checkout/:token/session',
    {preHandler: [rateLimitPrep('checkout.read')]},
    async (request) => {
      const params = z.object({token: z.string().min(16).max(200)}).parse(request.params);
      const query = z.object({session_token: z.string().min(16).max(200)}).parse(request.query);
      return ok(request, await paymentCoreService.getCheckoutSession(params.token, query.session_token));
    },
  );

  app.post(
    '/checkout/:token/payment',
    {preHandler: [rateLimitPrep('checkout.payment'), idempotencyPreHandler('checkout.payment')]},
    async (request) => {
      try {
        const params = z.object({token: z.string().min(16).max(200)}).parse(request.params);
        const body = z
          .object({
            session_token: z.string().min(16).max(200),
            payment_method_type_code: z.string().max(80).optional(),
            payment_method_token: z.string().max(200).optional(),
            // Explicitly rejected if present — never store card data
            card_number: z.undefined().optional(),
            pan: z.undefined().optional(),
            cvv: z.undefined().optional(),
            cvc: z.undefined().optional(),
          })
          .parse(request.body);
        const row = await paymentCoreService.confirmCheckoutPayment(params.token, {
          sessionToken: body.session_token,
          paymentMethodTypeCode: body.payment_method_type_code,
          paymentMethodToken: body.payment_method_token,
        });
        const payload = ok(request, row);
        await completeIdempotency(request, 200, payload);
        return payload;
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );
}
