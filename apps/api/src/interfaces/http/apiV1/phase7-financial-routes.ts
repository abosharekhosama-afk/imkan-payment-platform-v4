import type {FastifyInstance, FastifyReply} from 'fastify';
import {z} from 'zod';
import {requireOrganizationContext, requirePermission, requireStepUp} from '../../../foundation/authz.js';
import {completeIdempotency, failIdempotency, idempotencyPreHandler} from '../../../foundation/idempotency.js';
import {created, ok, parsePaging} from '../../../foundation/http.js';
import {rateLimit} from '../../../foundation/rate-limit.js';
import {refundsService} from '../../../refunds/refunds-service.js';
import {ledgerService} from '../../../ledger/ledger-service.js';
import {notFound} from '../../../foundation/errors.js';
import {
  payoutService,
  reconciliationService,
  settlementService,
} from '../../../finance/settlement-payout-recon.js';
import {feeScheduleService} from '../../../finance/fee-schedules-service.js';
import {financeStatementService} from '../../../finance/finance-statement-service.js';
import {disputesService, riskService} from '../../../risk/risk-disputes-service.js';
import {booksService} from '../../../books/books-connector.js';
import {getCapabilityProfile} from '../../../providers/capability-matrix.js';

const minor = z.string().regex(/^\d{1,30}$/);

function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  return reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(csv);
}

export async function registerPhase7FinancialRoutes(app: FastifyInstance) {
  app.get(
    '/refunds',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.refund', 'payments.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await refundsService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.get(
    '/refunds/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.refund', 'payments.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {id} = z.object({id: z.string().uuid()}).parse(request.params);
      return ok(request, await refundsService.get(request.auth!.organizationId!, id));
    },
  );

  app.post(
    '/refunds',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.refund', 'payments.manage', 'platform.admin'),
        requireStepUp('payments.refund'),
        idempotencyPreHandler('refunds.create'),
        rateLimit('payment_links.write'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            payment_intent_id: z.string().uuid(),
            amount_minor: minor,
            currency_code: z.string().length(3),
            reason: z.string().max(500).optional().nullable(),
          })
          .parse(request.body);
        const row = await refundsService.createRefund({
          organizationId: request.auth!.organizationId!,
          paymentIntentId: body.payment_intent_id,
          amountMinor: body.amount_minor,
          currency: body.currency_code,
          reason: body.reason,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          idempotencyKey: (request as any).idempotency?.key || null,
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
    '/balances',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('balances.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const q = z
        .object({
          environment: z.enum(['SANDBOX', 'LIVE']).optional(),
          currency_code: z.string().length(3).optional(),
        })
        .parse(request.query || {});
      const balances = await ledgerService.getBalances(
        request.auth!.organizationId!,
        q.environment || 'SANDBOX',
        {currencyCode: q.currency_code?.toUpperCase() || null},
      );
      return ok(request, balances);
    },
  );

  app.get(
    '/merchant/finance/statement',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('reports.read', 'balances.read', 'settlements.read', 'platform.finance'),
      ],
    },
    async (request, reply) => {
      const q = z
        .object({
          environment: z.enum(['SANDBOX', 'LIVE']).optional(),
          currency_code: z.string().length(3).optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          format: z.enum(['csv']).optional(),
        })
        .parse(request.query || {});
      const filters = {
        environment: q.environment,
        currencyCode: q.currency_code,
        from: q.from,
        to: q.to,
      };
      if (q.format === 'csv') {
        const csv = await financeStatementService.exportStatementCsv(request.auth!.organizationId!, filters);
        return sendCsv(reply, 'statement.csv', csv);
      }
      return ok(request, await financeStatementService.getStatement(request.auth!.organizationId!, filters));
    },
  );

  app.get(
    '/payments/:id/fees',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payments.read', 'reports.read', 'platform.finance'),
      ],
    },
    async (request) => {
      const {id} = z.object({id: z.string().uuid()}).parse(request.params);
      const row = await financeStatementService.getPaymentFees(request.auth!.organizationId!, id);
      if (!row) throw notFound('Payment not found', 'PAYMENT_NOT_FOUND');
      return ok(request, row);
    },
  );

  app.get(
    '/fee-schedules',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => ok(request, await feeScheduleService.list(request.auth!.organizationId!)),
  );

  app.post(
    '/fee-schedules',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('platform.admin', 'platform.finance'),
        requireStepUp(),
        idempotencyPreHandler('fee_schedules.upsert'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            environment: z.enum(['SANDBOX', 'LIVE']).optional(),
            currency_code: z.string().length(3),
            fee_type_code: z.string().min(1).max(40).optional(),
            name: z.string().min(1).max(200),
            basis_points: z.number().int().min(0).max(100_000),
            fixed_minor: minor,
            is_active: z.boolean().optional(),
            effective_from: z.string().datetime().optional().nullable(),
            effective_to: z.string().datetime().optional().nullable(),
          })
          .parse(request.body);
        const row = await feeScheduleService.upsert(
          request.auth!.organizationId!,
          {
            environment: body.environment,
            currencyCode: body.currency_code,
            feeTypeCode: body.fee_type_code,
            name: body.name,
            basisPoints: body.basis_points,
            fixedMinor: body.fixed_minor,
            isActive: body.is_active,
            effectiveFrom: body.effective_from,
            effectiveTo: body.effective_to,
          },
          {
            userId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
            requestId: request.id,
          },
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

  app.post(
    '/fee-schedules/preview',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const body = z
        .object({
          environment: z.enum(['SANDBOX', 'LIVE']).optional(),
          currency_code: z.string().length(3),
          gross_minor: minor,
        })
        .parse(request.body);
      return ok(
        request,
        await feeScheduleService.previewPlatformFee(request.auth!.organizationId!, {
          environment: body.environment,
          currencyCode: body.currency_code,
          grossMinor: body.gross_minor,
        }),
      );
    },
  );

  app.get(
    '/ledger/accounts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('balances.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => ok(request, await ledgerService.listAccounts(request.auth!.organizationId!)),
  );

  app.get(
    '/ledger/entries',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('balances.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await ledgerService.listEntries(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.get(
    '/settlements',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.read', 'settlements.manage', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await settlementService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.get(
    '/settlements/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.read', 'settlements.manage', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {id} = z.object({id: z.string().uuid()}).parse(request.params);
      return ok(request, await settlementService.get(request.auth!.organizationId!, id));
    },
  );

  app.post(
    '/settlements',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('settlements.manage'),
        idempotencyPreHandler('settlements.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            currency_code: z.string().length(3),
            period_start: z.string().datetime().optional().nullable(),
            period_end: z.string().datetime().optional().nullable(),
            environment: z.enum(['SANDBOX', 'LIVE']).optional(),
            provider_fees_minor: minor.optional().nullable(),
            adjustments_minor: z
              .string()
              .regex(/^-?\d{1,30}$/)
              .optional()
              .nullable(),
          })
          .parse(request.body);
        const row = await settlementService.createDraft({
          organizationId: request.auth!.organizationId!,
          currency: body.currency_code,
          periodStart: body.period_start,
          periodEnd: body.period_end,
          environment: body.environment,
          providerFeesMinor: body.provider_fees_minor,
          adjustmentsMinor: body.adjustments_minor,
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
    '/settlements/:id/finalize',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('settlements.finalize'),
        idempotencyPreHandler('settlements.finalize'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await settlementService.finalize({
          organizationId: request.auth!.organizationId!,
          settlementId: id,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        const statusCode = row.idempotent ? 200 : 200;
        await completeIdempotency(request, statusCode, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/settlements/:id/cancel',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('settlements.cancel'),
        idempotencyPreHandler('settlements.cancel'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await settlementService.cancel({
          organizationId: request.auth!.organizationId!,
          settlementId: id,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.get(
    '/payouts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.read', 'payouts.manage', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await payoutService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.get(
    '/payouts/:id',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.read', 'payouts.manage', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {id} = z.object({id: z.string().uuid()}).parse(request.params);
      return ok(request, await payoutService.get(request.auth!.organizationId!, id));
    },
  );

  app.post(
    '/payouts',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('payouts.manage'),
        idempotencyPreHandler('payouts.create'),
      ],
    },
    async (request, reply) => {
      try {
        const body = z
          .object({
            settlement_id: z.string().uuid(),
            payout_account_id: z.string().uuid(),
            amount_minor: minor.optional(),
          })
          .parse(request.body);
        const row = await payoutService.create({
          organizationId: request.auth!.organizationId!,
          settlementId: body.settlement_id,
          payoutAccountId: body.payout_account_id,
          amountMinor: body.amount_minor,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
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
    '/payouts/:id/submit',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('payouts.submit'),
        idempotencyPreHandler('payouts.submit'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await payoutService.submit({
          organizationId: request.auth!.organizationId!,
          payoutId: id,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/payouts/:id/approve',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('platform.admin', 'platform.finance', 'payouts.manage'),
        requireStepUp('payouts.mark_paid'),
        idempotencyPreHandler('payouts.approve'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const body = z.object({external_evidence_ref: z.string().min(3).max(200)}).parse(request.body || {});
        const row = await payoutService.approve({
          organizationId: request.auth!.organizationId!,
          payoutId: id,
          evidenceRef: body.external_evidence_ref,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/payouts/:id/mark-paid',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('payouts.mark_paid'),
        idempotencyPreHandler('payouts.mark_paid'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await payoutService.markPaid({
          organizationId: request.auth!.organizationId!,
          payoutId: id,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/payouts/:id/fail',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('payouts.fail'),
        idempotencyPreHandler('payouts.fail'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const body = z.object({reason: z.string().max(500).optional()}).parse(request.body ?? {});
        const row = await payoutService.fail({
          organizationId: request.auth!.organizationId!,
          payoutId: id,
          reason: body.reason,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.post(
    '/payouts/:id/cancel',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('payouts.manage', 'platform.admin', 'platform.finance'),
        requireStepUp('payouts.cancel'),
        idempotencyPreHandler('payouts.cancel'),
      ],
    },
    async (request, reply) => {
      try {
        const {id} = z.object({id: z.string().uuid()}).parse(request.params);
        const row = await payoutService.cancel({
          organizationId: request.auth!.organizationId!,
          payoutId: id,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
          idempotencyKey: request.headers['idempotency-key'] as string | undefined,
        });
        await completeIdempotency(request, 200, {data: row, meta: {request_id: request.id}});
        return ok(request, row);
      } catch (error) {
        await failIdempotency(request);
        throw error;
      }
    },
  );

  app.get(
    '/reconciliation/runs',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.read', 'balances.read', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await reconciliationService.listRuns(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.post(
    '/reconciliation/runs',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('settlements.manage', 'platform.admin', 'platform.finance'),
      ],
    },
    async (request, reply) =>
      created(reply, request, await reconciliationService.run(request.auth!.organizationId!)),
  );

  app.get(
    '/risk/signals',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('disputes.read', 'platform.risk.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await riskService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.post(
    '/risk/signals',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('disputes.manage', 'platform.risk.manage', 'platform.admin'),
      ],
    },
    async (request, reply) => {
      const body = z
        .object({
          payment_intent_id: z.string().uuid().optional().nullable(),
          signal_type: z.string().min(1).max(100),
          score: z.number().optional().nullable(),
          decision: z.enum(['ALLOW', 'BLOCK', 'REVIEW']).optional(),
          details: z.record(z.string(), z.unknown()).optional(),
        })
        .parse(request.body);
      return created(
        reply,
        request,
        await riskService.create({
          organizationId: request.auth!.organizationId!,
          paymentIntentId: body.payment_intent_id,
          signalType: body.signal_type,
          score: body.score,
          decision: body.decision,
          details: body.details,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    '/disputes',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('disputes.read', 'disputes.manage', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await disputesService.list(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );

  app.post(
    '/disputes',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('disputes.manage', 'platform.admin'),
      ],
    },
    async (request, reply) => {
      const body = z
        .object({
          payment_intent_id: z.string().uuid().optional().nullable(),
          amount_minor: minor,
          currency_code: z.string().length(3),
          reason: z.string().max(500).optional().nullable(),
        })
        .parse(request.body);
      return created(
        reply,
        request,
        await disputesService.create({
          organizationId: request.auth!.organizationId!,
          paymentIntentId: body.payment_intent_id,
          amountMinor: body.amount_minor,
          currency: body.currency_code,
          reason: body.reason,
          actorUserId: request.auth!.authKind === 'session' ? request.auth!.userId : null,
          requestId: request.id,
        }),
      );
    },
  );

  app.get(
    '/providers/:code/capability-profile',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('providers.read', 'developer.read', 'platform.admin'),
      ],
    },
    async (request) => {
      const {code} = z.object({code: z.string().min(2).max(40)}).parse(request.params);
      return ok(request, getCapabilityProfile(code));
    },
  );

  app.get(
    '/books/sync-state',
    {
      preHandler: [
        requireOrganizationContext(),
        requirePermission('books.read', 'integrations.read', 'platform.admin'),
      ],
    },
    async (request) => {
      const {limit, offset} = parsePaging(request.query);
      return ok(request, await booksService.listSyncState(request.auth!.organizationId!, limit, offset), {
        limit,
        offset,
      });
    },
  );
}
