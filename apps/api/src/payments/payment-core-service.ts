import {randomToken} from '../foundation/crypto.js';
import {AppError, conflict, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent, writeSecurityEvent} from '../foundation/audit.js';
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {assertActiveCurrency, ensureMerchantProfile, parseMinorAmount} from './merchant-context.js';
import {paymentConfigService} from './payment-config-service.js';
import {paymentLinksService} from './payment-links-service.js';
import {providerRouter, resolvePaymentEnvironment} from '../providers/router.js';
import {assertProductionPaymentMethodAllowed} from '../platform/sandbox-token-guard.js';
import {ledgerService} from '../ledger/ledger-service.js';
import {assertSafePublicUrl} from '../security/url-safety.js';
import {assertMerchantPaymentsAllowed} from '../security/onboarding-gate.js';
import {
  recordIntentTransition,
  transitionPaymentIntent,
  type PaymentIntentStatus,
} from './payment-state-machine.js';

type Actor = {userId?: string | null; requestId?: string};

const SESSION_TTL_MINUTES = 60;

function money(row: any) {
  if (!row) return row;
  return {
    ...row,
    amount_minor: row.amount_minor != null ? String(row.amount_minor) : null,
  };
}

async function emitPaymentEvent(
  client: PgClient,
  eventType: string,
  organizationId: string,
  intent: any,
  extra: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  await emitOutboxEvent(
    {
      organizationId,
      eventType,
      aggregateType: 'payment_intent',
      aggregateId: intent.id,
      payload: {
        payment_intent_id: intent.id,
        organization_id: organizationId,
        merchant_profile_id: intent.merchant_profile_id,
        payment_link_id: intent.payment_link_id,
        payment_order_id: intent.payment_order_id,
        amount_minor: String(intent.amount_minor),
        currency_code: String(intent.currency_code).trim(),
        status: intent.status,
        reference: intent.reference,
        customer_email: intent.customer_email,
        customer_name: intent.customer_name,
        description: intent.description,
        ...extra,
      },
      idempotencyKey,
    },
    client,
  );
}

async function expireOpenSessionIfNeeded(client: PgClient, session: any) {
  if (session.status === 'OPEN' && new Date(session.expires_at).getTime() <= Date.now()) {
    const r = await client.query(
      `UPDATE payment_sessions
       SET status='EXPIRED', version=version+1, updated_at=NOW()
       WHERE id=$1 AND status='OPEN' AND version=$2
       RETURNING *`,
      [session.id, session.version],
    );
    if (r.rows[0]) {
      const intent = await client.query(`SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE`, [
        session.payment_intent_id,
      ]);
      if (intent.rows[0] && ['CREATED', 'REQUIRES_PAYMENT'].includes(intent.rows[0].status)) {
        await transitionPaymentIntent(
          client,
          intent.rows[0],
          'EXPIRED',
          {type: 'SYSTEM'},
          'Checkout session expired',
          ['expired_at=NOW()'],
        );
        await emitPaymentEvent(client, 'payment.expired', session.organization_id, {
          ...intent.rows[0],
          status: 'EXPIRED',
        });
      }
      return r.rows[0];
    }
  }
  return session;
}

export const paymentCoreService = {
  // ---------------------------------------------------------------- merchant

  async listPayments(organizationId: string, filter: {status?: string; limit: number; offset: number}) {
    const params: unknown[] = [organizationId];
    let where = 'WHERE organization_id=$1';
    if (filter.status) {
      params.push(filter.status);
      where += ` AND status=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const intents = await pgQuery(
      `SELECT * FROM payment_intents ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return intents.rows.map(money);
  },

  async getPayment(organizationId: string, paymentIntentId: string) {
    const intent = await pgQuery(`SELECT * FROM payment_intents WHERE id=$1 AND organization_id=$2`, [
      paymentIntentId,
      organizationId,
    ]);
    if (!intent.rows[0]) throw notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    const [order, sessions, attempts, transactions, history] = await Promise.all([
      intent.rows[0].payment_order_id
        ? pgQuery(`SELECT * FROM payment_orders WHERE id=$1 AND organization_id=$2`, [
            intent.rows[0].payment_order_id,
            organizationId,
          ])
        : Promise.resolve({rows: [] as any[]}),
      pgQuery(`SELECT * FROM payment_sessions WHERE payment_intent_id=$1 AND organization_id=$2 ORDER BY created_at`, [
        paymentIntentId,
        organizationId,
      ]),
      pgQuery(
        `SELECT id, attempt_number, status, provider_code, provider_reference, payment_method_type_code,
                failure_code, failure_message, started_at, finished_at, created_at
         FROM payment_attempts WHERE payment_intent_id=$1 AND organization_id=$2 ORDER BY attempt_number`,
        [paymentIntentId, organizationId],
      ),
      pgQuery(
        `SELECT id, amount_minor, currency_code, status, provider_code, provider_transaction_id,
                captured_at, created_at
         FROM payment_transactions WHERE payment_intent_id=$1 AND organization_id=$2 ORDER BY created_at`,
        [paymentIntentId, organizationId],
      ),
      pgQuery(
        `SELECT from_status, to_status, actor_type, reason, created_at
         FROM payment_intent_transitions WHERE payment_intent_id=$1 ORDER BY created_at`,
        [paymentIntentId],
      ),
    ]);
    return {
      intent: money(intent.rows[0]),
      order: order.rows[0] ? money(order.rows[0]) : null,
      sessions: sessions.rows.map(money),
      attempts: attempts.rows,
      transactions: transactions.rows.map(money),
      history: history.rows,
    };
  },

  async cancelPayment(organizationId: string, paymentIntentId: string, actor: Actor & {userId: string}, reason?: string) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `SELECT * FROM payment_intents WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [paymentIntentId, organizationId],
      );
      if (!r.rows[0]) throw notFound('Payment not found', 'PAYMENT_NOT_FOUND');
      const updated = await transitionPaymentIntent(
        client,
        r.rows[0],
        'CANCELLED',
        {userId: actor.userId, type: 'MERCHANT'},
        reason || 'Cancelled by merchant',
        ['cancelled_at=NOW()'],
      );
      await client.query(
        `UPDATE payment_sessions SET status='CANCELLED', version=version+1, updated_at=NOW()
         WHERE payment_intent_id=$1 AND status='OPEN'`,
        [paymentIntentId],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'payment.cancel',
          resourceType: 'payment_intents',
          resourceId: paymentIntentId,
          requestId: actor.requestId,
          metadata: {reason},
        },
        client,
      );
      await emitPaymentEvent(client, 'payment.cancelled', organizationId, updated, {}, `payment-cancel-${paymentIntentId}-v${r.rows[0].version}`);
      return money(updated);
    });
  },

  // ---------------------------------------------------------------- public checkout

  /** GET /checkout/:token — link + branding (no customer account required). */
  async getCheckoutPage(linkToken: string) {
    const link = await paymentLinksService.getByPublicToken(linkToken);
    if (link.status !== 'ACTIVE') {
      throw new AppError('PAYMENT_LINK_NOT_AVAILABLE', `Payment link is ${link.status}`, 409, {
        status: link.status,
      });
    }
    if (link.max_uses != null && Number(link.use_count) >= Number(link.max_uses)) {
      throw new AppError('PAYMENT_LINK_USAGE_LIMIT', 'Payment link usage limit reached', 409);
    }
    const branding = await paymentConfigService.getPublicBranding(link.organization_id);
    return {
      link: {
        id: link.id,
        title: link.title,
        description: link.description,
        amount_mode: link.amount_mode,
        amount_minor: link.amount_minor != null ? String(link.amount_minor) : null,
        currency_code: String(link.currency_code).trim(),
        reference: link.reference,
        expires_at: link.expires_at,
        one_time: link.one_time,
      },
      branding: branding || {
        company_display_name: null,
        logo_url: null,
        brand_primary_color: null,
        brand_secondary_color: null,
        description: null,
        support_email: null,
        support_phone: null,
        checkout_theme_json: {},
      },
      payment_method_types: ['CARD'], // selection UI only — no PAN; sandbox tokenized path
      states: {
        success: 'SUCCEEDED',
        failure: 'FAILED',
        cancel: 'CANCELLED',
      },
    };
  },

  /**
   * POST /checkout/:token/session
   * Creates Order → Intent (CREATED→REQUIRES_PAYMENT) → Session.
   */
  async createCheckoutSession(
    linkToken: string,
    input: {
      amountMinor?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      successUrl?: string;
      cancelUrl?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const successUrlSafe = assertSafePublicUrl(input.successUrl, 'success_url');
    const cancelUrlSafe = assertSafePublicUrl(input.cancelUrl, 'cancel_url');
    return withPgTransaction(async (client) => {
      const linkRow = await client.query(`SELECT * FROM payment_links WHERE public_token=$1 FOR UPDATE`, [linkToken]);
      if (!linkRow.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
      let link = linkRow.rows[0];
      await assertMerchantPaymentsAllowed(link.organization_id);
      if (link.status === 'ACTIVE' && link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE payment_links SET status='EXPIRED', version=version+1, updated_at=NOW() WHERE id=$1`,
          [link.id],
        );
        link = {...link, status: 'EXPIRED'};
      }
      if (link.status !== 'ACTIVE') {
        throw new AppError('PAYMENT_LINK_NOT_AVAILABLE', `Payment link is ${link.status}`, 409);
      }
      if (link.max_uses != null && Number(link.use_count) >= Number(link.max_uses)) {
        throw new AppError('PAYMENT_LINK_USAGE_LIMIT', 'Payment link usage limit reached', 409);
      }

      let amountMinor: string;
      if (link.amount_mode === 'FIXED') {
        amountMinor = String(link.amount_minor);
      } else {
        if (input.amountMinor == null) {
          throw new AppError('AMOUNT_REQUIRED', 'amount_minor is required for customer-entered amount links', 400);
        }
        amountMinor = parseMinorAmount(input.amountMinor);
      }

      const currency = String(link.currency_code).trim();
      await assertActiveCurrency(client, currency);
      await ensureMerchantProfile(client, link.organization_id);

      const cfg = await client.query(`SELECT * FROM merchant_payment_config WHERE organization_id=$1`, [
        link.organization_id,
      ]);
      const successUrl =
        successUrlSafe ?? assertSafePublicUrl(cfg.rows[0]?.default_success_url, 'success_url') ?? null;
      const cancelUrl =
        cancelUrlSafe ?? assertSafePublicUrl(cfg.rows[0]?.default_cancel_url, 'cancel_url') ?? null;

      const order = await client.query(
        `INSERT INTO payment_orders (
           organization_id, merchant_profile_id, payment_link_id, order_number, description,
           amount_minor, currency_code, customer_name, customer_email, customer_phone, metadata_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          link.organization_id,
          link.merchant_profile_id,
          link.id,
          link.reference || null,
          link.description || link.title,
          amountMinor,
          currency,
          input.customerName || null,
          input.customerEmail || null,
          input.customerPhone || null,
          JSON.stringify(input.metadata || {}),
        ],
      );

      const intent = await client.query(
        `INSERT INTO payment_intents (
           organization_id, merchant_profile_id, payment_link_id, payment_order_id,
           amount_minor, currency_code, status, customer_name, customer_email, customer_phone,
           description, reference, success_url, cancel_url, expires_at, metadata_json
         ) VALUES ($1,$2,$3,$4,$5,$6,'CREATED',$7,$8,$9,$10,$11,$12,$13,NOW() + ($14 || ' minutes')::interval,$15)
         RETURNING *`,
        [
          link.organization_id,
          link.merchant_profile_id,
          link.id,
          order.rows[0].id,
          amountMinor,
          currency,
          input.customerName || null,
          input.customerEmail || null,
          input.customerPhone || null,
          link.description || link.title,
          link.reference || null,
          successUrl,
          cancelUrl,
          String(SESSION_TTL_MINUTES),
          JSON.stringify(input.metadata || {}),
        ],
      );
      await recordIntentTransition(client, {
        paymentIntentId: intent.rows[0].id,
        organizationId: link.organization_id,
        fromStatus: null,
        toStatus: 'CREATED',
        actorType: 'CUSTOMER',
        reason: 'Checkout session started',
      });

      const requiresPayment = await transitionPaymentIntent(
        client,
        intent.rows[0],
        'REQUIRES_PAYMENT',
        {type: 'CUSTOMER'},
        'Awaiting payment method',
      );

      const resolved = await providerRouter.resolve({
        organizationId: link.organization_id,
        environment: resolvePaymentEnvironment(),
        currencyCode: currency,
        requiredCapability: 'payment.authorize',
      });
      const providerPrep = await providerRouter.run({
        resolved,
        operation: 'AUTHORIZE',
        paymentIntentId: requiresPayment.id,
        idempotencyKey: `checkout-prep:${requiresPayment.id}`,
        client,
        fn: () =>
          resolved.adapter.authorize({
            organizationId: link.organization_id,
            paymentIntentId: requiresPayment.id,
            paymentAttemptId: requiresPayment.id,
            amountMinor,
            currencyCode: currency,
          }),
      });

      const sessionToken = randomToken(24);
      const session = await client.query(
        `INSERT INTO payment_sessions (
           organization_id, merchant_profile_id, payment_link_id, payment_intent_id, payment_order_id,
           public_token, status, customer_name, customer_email, customer_phone,
           amount_minor, currency_code, success_url, cancel_url, expires_at, metadata_json
         ) VALUES ($1,$2,$3,$4,$5,$6,'OPEN',$7,$8,$9,$10,$11,$12,$13,NOW() + ($14 || ' minutes')::interval,$15)
         RETURNING *`,
        [
          link.organization_id,
          link.merchant_profile_id,
          link.id,
          requiresPayment.id,
          order.rows[0].id,
          sessionToken,
          input.customerName || null,
          input.customerEmail || null,
          input.customerPhone || null,
          amountMinor,
          currency,
          successUrl,
          cancelUrl,
          String(SESSION_TTL_MINUTES),
          JSON.stringify({
            provider_reference: providerPrep.providerReference || null,
            provider_account_id: resolved.providerAccountId,
            ...(input.metadata || {}),
          }),
        ],
      );

      await emitPaymentEvent(client, 'payment.created', link.organization_id, requiresPayment, {
        payment_session_id: session.rows[0].id,
        payment_link_id: link.id,
      }, `payment-created-${requiresPayment.id}`);

      const branding = await paymentConfigService.getPublicBranding(link.organization_id);
      return {
        session: money({...session.rows[0], public_token: sessionToken}),
        intent: money(requiresPayment),
        order: money(order.rows[0]),
        branding,
        provider: {code: resolved.providerCode, status: providerPrep.status, environment: resolved.environment},
      };
    });
  },

  async getCheckoutSession(linkToken: string, sessionToken: string) {
    return withPgTransaction(async (client) => {
      const link = await client.query(`SELECT id, organization_id, public_token, status FROM payment_links WHERE public_token=$1`, [
        linkToken,
      ]);
      if (!link.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
      const s = await client.query(
        `SELECT * FROM payment_sessions
         WHERE public_token=$1 AND payment_link_id=$2 FOR UPDATE`,
        [sessionToken, link.rows[0].id],
      );
      if (!s.rows[0]) throw notFound('Checkout session not found', 'CHECKOUT_SESSION_NOT_FOUND');
      const session = await expireOpenSessionIfNeeded(client, s.rows[0]);
      const intent = await client.query(`SELECT * FROM payment_intents WHERE id=$1`, [session.payment_intent_id]);
      return {
        session: money(session),
        intent: money(intent.rows[0]),
        link_status: link.rows[0].status,
      };
    });
  },

  /**
   * POST /checkout/:token/payment
   * Concurrent-safe: locks session + intent; one in-flight attempt; optimistic version on intent.
   * Never accepts PAN/CVV — only opaque payment_method_token + method type code.
   */
  async confirmCheckoutPayment(
    linkToken: string,
    input: {
      sessionToken: string;
      paymentMethodTypeCode?: string;
      paymentMethodToken?: string;
    },
  ) {
    // Reject obvious card-data fields if clients send them (defense in depth).
    const raw = input as any;
    if (raw.card_number || raw.pan || raw.cvv || raw.cvc || raw.card_cvv) {
      throw new AppError('CARD_DATA_FORBIDDEN', 'Card PAN/CVV must not be submitted to this API', 400);
    }
    assertProductionPaymentMethodAllowed(input.paymentMethodToken);

    return withPgTransaction(async (client) => {
      const link = await client.query(`SELECT * FROM payment_links WHERE public_token=$1 FOR UPDATE`, [linkToken]);
      if (!link.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
      if (link.rows[0].status !== 'ACTIVE') {
        throw new AppError('PAYMENT_LINK_NOT_AVAILABLE', `Payment link is ${link.rows[0].status}`, 409);
      }

      const s = await client.query(
        `SELECT * FROM payment_sessions
         WHERE public_token=$1 AND payment_link_id=$2 FOR UPDATE`,
        [input.sessionToken, link.rows[0].id],
      );
      if (!s.rows[0]) throw notFound('Checkout session not found', 'CHECKOUT_SESSION_NOT_FOUND');
      let session = await expireOpenSessionIfNeeded(client, s.rows[0]);
      if (session.status !== 'OPEN') {
        throw conflict(`Checkout session is ${session.status}`, 'CHECKOUT_SESSION_NOT_OPEN');
      }

      const intentRow = await client.query(`SELECT * FROM payment_intents WHERE id=$1 FOR UPDATE`, [
        session.payment_intent_id,
      ]);
      if (!intentRow.rows[0]) throw notFound('Payment not found', 'PAYMENT_NOT_FOUND');
      let intent = intentRow.rows[0];
      if (intent.status !== 'REQUIRES_PAYMENT') {
        throw conflict(`Payment cannot be confirmed from status ${intent.status}`, 'PAYMENT_INVALID_TRANSITION');
      }

      const nextAttempt = await client.query<{n: number}>(
        `SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS n FROM payment_attempts WHERE payment_intent_id=$1`,
        [intent.id],
      );

      const resolved = await providerRouter.resolve({
        organizationId: session.organization_id,
        environment: resolvePaymentEnvironment(),
        currencyCode: String(intent.currency_code).trim(),
        paymentMethodTypeCode: input.paymentMethodTypeCode || 'CARD',
        requiredCapability: 'payment.authorize',
      });

      let attempt;
      try {
        const a = await client.query(
          `INSERT INTO payment_attempts (
             organization_id, payment_session_id, payment_intent_id, attempt_number,
             status, provider_code, payment_method_type_code, started_at
           ) VALUES ($1,$2,$3,$4,'CREATED',$5,$6,NOW())
           RETURNING *`,
          [
            session.organization_id,
            session.id,
            intent.id,
            nextAttempt.rows[0].n,
            resolved.providerCode,
            input.paymentMethodTypeCode || 'CARD',
          ],
        );
        attempt = a.rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          throw conflict('Another payment attempt is already in progress', 'PAYMENT_ATTEMPT_IN_FLIGHT');
        }
        throw error;
      }

      intent = await transitionPaymentIntent(
        client,
        intent,
        'PROCESSING',
        {type: 'CUSTOMER'},
        'Customer submitted payment',
      );
      await emitPaymentEvent(client, 'payment.processing', session.organization_id, intent, {
        payment_attempt_id: attempt.id,
        payment_session_id: session.id,
      });

      await client.query(
        `UPDATE payment_attempts SET status='PROCESSING', version=version+1, updated_at=NOW() WHERE id=$1`,
        [attempt.id],
      );

      const result = await providerRouter.run({
        resolved,
        operation: 'AUTHORIZE',
        paymentIntentId: intent.id,
        paymentAttemptId: attempt.id,
        idempotencyKey: `authorize:${attempt.id}`,
        client,
        fn: () =>
          resolved.adapter.authorize({
            organizationId: session.organization_id,
            paymentIntentId: intent.id,
            paymentAttemptId: attempt.id,
            amountMinor: String(intent.amount_minor),
            currencyCode: String(intent.currency_code).trim(),
            paymentMethodTypeCode: input.paymentMethodTypeCode || 'CARD',
            paymentMethodToken: input.paymentMethodToken || null,
            idempotencyKey: `authorize:${attempt.id}`,
          }),
      });

      if (result.status === 'SUCCEEDED') {
        await client.query(
          `UPDATE payment_attempts
           SET status='SUCCEEDED', provider_reference=$2, finished_at=NOW(), version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null],
        );
        intent = await transitionPaymentIntent(
          client,
          intent,
          'SUCCEEDED',
          {type: 'PROVIDER'},
          'Provider confirmed success',
          ['succeeded_at=NOW()'],
        );
        const txn = await client.query(
          `INSERT INTO payment_transactions (
             organization_id, merchant_profile_id, payment_link_id, payment_order_id,
             payment_session_id, payment_intent_id, payment_attempt_id,
             amount_minor, currency_code, status, provider_code, provider_transaction_id,
             customer_name, customer_email, description, reference, captured_at, metadata_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUCCEEDED',$10,$11,$12,$13,$14,$15,NOW(),$16)
           RETURNING *`,
          [
            session.organization_id,
            session.merchant_profile_id,
            session.payment_link_id,
            session.payment_order_id,
            session.id,
            intent.id,
            attempt.id,
            intent.amount_minor,
            intent.currency_code,
            result.providerCode,
            result.providerTransactionId || result.providerReference || null,
            intent.customer_name,
            intent.customer_email,
            intent.description,
            intent.reference,
            JSON.stringify({sandbox: result.providerCode === 'sandbox'}),
          ],
        );
        await client.query(
          `UPDATE payment_sessions
           SET status='COMPLETED', completed_at=NOW(), version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [session.id],
        );
        await client.query(
          `UPDATE payment_orders SET status='PAID', updated_at=NOW() WHERE id=$1`,
          [session.payment_order_id],
        );
        await paymentLinksService.recordSuccessfulUse(client, link.rows[0].id, session.organization_id);
        await ledgerService.postPaymentSucceededWithClient(client, {
          organizationId: session.organization_id,
          paymentIntentId: intent.id,
          amountMinor: String(intent.amount_minor),
          currencyCode: String(intent.currency_code).trim(),
          environment: resolved.environment,
        });
        await writeSecurityEvent(
          {
            organizationId: session.organization_id,
            eventType: 'payment.succeeded',
            metadata: {payment_intent_id: intent.id, payment_transaction_id: txn.rows[0].id},
          },
          client,
        );
        await emitPaymentEvent(
          client,
          'payment.succeeded',
          session.organization_id,
          intent,
          {
            payment_transaction_id: txn.rows[0].id,
            payment_attempt_id: attempt.id,
            payment_session_id: session.id,
            provider_code: result.providerCode,
            provider_transaction_id: result.providerTransactionId || null,
          },
          `payment-succeeded-${intent.id}`,
        );
        return {
          status: 'SUCCEEDED' as const,
          intent: money(intent),
          transaction: money(txn.rows[0]),
          success_url: intent.success_url,
          cancel_url: intent.cancel_url,
        };
      }

      // Ambiguous / timeout: do NOT re-charge; record failure_code and advise query-before-retry.
      if (result.status === 'AMBIGUOUS' || result.queryBeforeRetry) {
        const failureCode = result.failureCode || 'PROVIDER_AMBIGUOUS';
        const failureMessage =
          result.failureMessage ||
          'Provider outcome ambiguous — query status before any retry; do not re-charge';
        await client.query(
          `UPDATE payment_attempts
           SET status='FAILED', provider_reference=$2, failure_code=$3, failure_message=$4,
               finished_at=NOW(), version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null, failureCode, failureMessage],
        );
        intent = await transitionPaymentIntent(
          client,
          intent,
          'FAILED',
          {type: 'PROVIDER'},
          failureMessage,
          ['failed_at=NOW()', 'failure_code=$5', 'failure_message=$6'],
          [failureCode, failureMessage],
        );
        await writeSecurityEvent(
          {
            organizationId: session.organization_id,
            eventType: 'payment.ambiguous',
            success: false,
            metadata: {
              payment_intent_id: intent.id,
              payment_attempt_id: attempt.id,
              query_before_retry: true,
              provider_code: result.providerCode,
            },
          },
          client,
        );
        await emitPaymentEvent(
          client,
          'payment.failed',
          session.organization_id,
          intent,
          {
            payment_attempt_id: attempt.id,
            failure_code: failureCode,
            failure_message: failureMessage,
            query_before_retry: true,
          },
          `payment-ambiguous-${intent.id}-a${attempt.attempt_number}`,
        );
        return {
          status: 'FAILED' as const,
          intent: money(intent),
          transaction: null,
          success_url: intent.success_url,
          cancel_url: intent.cancel_url,
          failure_code: failureCode,
          failure_message: failureMessage,
          query_before_retry: true,
        };
      }

      // Hosted checkout / 3DS — async confirmation via webhook (PayTabs HPP).
      if (result.status === 'REQUIRES_ACTION') {
        await client.query(
          `UPDATE payment_attempts
           SET status='PROCESSING', provider_reference=$2, version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null],
        );
        const action = (result.details?.action as {type?: string; url?: string} | undefined) || {
          type: '3DS',
          url: result.details?.redirect_url,
        };
        return {
          status: 'REQUIRES_ACTION' as const,
          intent: money(intent),
          transaction: null,
          success_url: intent.success_url,
          cancel_url: intent.cancel_url,
          provider_reference: result.providerReference,
          provider_code: result.providerCode,
          action,
          redirect_url: result.details?.redirect_url || action.url,
        };
      }

      if (result.status === 'PENDING') {
        await client.query(
          `UPDATE payment_attempts
           SET status='PROCESSING', provider_reference=$2, version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null],
        );
        return {
          status: 'PENDING' as const,
          intent: money(intent),
          transaction: null,
          success_url: intent.success_url,
          cancel_url: intent.cancel_url,
          provider_reference: result.providerReference,
          provider_code: result.providerCode,
        };
      }

      // FAILED path
      await client.query(
        `UPDATE payment_attempts
         SET status='FAILED', provider_reference=$2, failure_code=$3, failure_message=$4,
             finished_at=NOW(), version=version+1, updated_at=NOW()
         WHERE id=$1`,
        [attempt.id, result.providerReference || null, result.failureCode || 'PROVIDER_FAILED', result.failureMessage || 'Payment failed'],
      );
      intent = await transitionPaymentIntent(
        client,
        intent,
        'FAILED',
        {type: 'PROVIDER'},
        result.failureMessage || 'Provider reported failure',
        ['failed_at=NOW()', 'failure_code=$5', 'failure_message=$6'],
        [result.failureCode || 'PROVIDER_FAILED', result.failureMessage || 'Payment failed'],
      );
      await client.query(
        `INSERT INTO payment_transactions (
           organization_id, merchant_profile_id, payment_link_id, payment_order_id,
           payment_session_id, payment_intent_id, payment_attempt_id,
           amount_minor, currency_code, status, provider_code, provider_transaction_id,
           customer_name, customer_email, description, reference, metadata_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'FAILED',$10,$11,$12,$13,$14,$15,$16)`,
        [
          session.organization_id,
          session.merchant_profile_id,
          session.payment_link_id,
          session.payment_order_id,
          session.id,
          intent.id,
          attempt.id,
          intent.amount_minor,
          intent.currency_code,
          result.providerCode,
          result.providerReference || null,
          intent.customer_name,
          intent.customer_email,
          intent.description,
          intent.reference,
          JSON.stringify({failure_code: result.failureCode}),
        ],
      );
      await writeSecurityEvent(
        {
          organizationId: session.organization_id,
          eventType: 'payment.failed',
          success: false,
          metadata: {payment_intent_id: intent.id, failure_code: result.failureCode},
        },
        client,
      );
      await emitPaymentEvent(
        client,
        'payment.failed',
        session.organization_id,
        intent,
        {
          payment_attempt_id: attempt.id,
          failure_code: result.failureCode,
          failure_message: result.failureMessage,
        },
        `payment-failed-${intent.id}-a${attempt.attempt_number}`,
      );
      return {
        status: 'FAILED' as const,
        intent: money(intent),
        transaction: null,
        success_url: intent.success_url,
        cancel_url: intent.cancel_url,
        failure_code: result.failureCode,
        failure_message: result.failureMessage,
      };
    });
  },

  /**
   * Off-session billing collection (Phase 6).
   * Path: Billing → Payment Core → Provider Router → Adapter.
   * No payment link/session required (nullable FKs from migration 018).
   */
  async collectForBilling(
    organizationId: string,
    input: {
      amountMinor: string;
      currencyCode: string;
      customerEmail?: string | null;
      customerName?: string | null;
      description?: string | null;
      reference: string;
      paymentMethodToken: string;
      idempotencyKey: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    assertProductionPaymentMethodAllowed(input.paymentMethodToken);
    const amountMinor = parseMinorAmount(input.amountMinor);
    const currency = input.currencyCode.toUpperCase();

    return withPgTransaction(async (client) => {
      await assertActiveCurrency(client, currency);
      const merchant = await ensureMerchantProfile(client, organizationId);

      const intentIns = await client.query(
        `INSERT INTO payment_intents (
           organization_id, merchant_profile_id, amount_minor, currency_code, status,
           customer_name, customer_email, description, reference, metadata_json
         ) VALUES ($1,$2,$3,$4,'CREATED',$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          organizationId,
          merchant.id,
          amountMinor,
          currency,
          input.customerName || null,
          input.customerEmail || null,
          input.description || null,
          input.reference,
          JSON.stringify({source: 'billing', ...(input.metadata || {})}),
        ],
      );
      let intent = intentIns.rows[0];
      await recordIntentTransition(client, {
        paymentIntentId: intent.id,
        organizationId,
        fromStatus: null,
        toStatus: 'CREATED',
        actorType: 'SYSTEM',
        reason: 'Billing collection intent',
      });
      intent = await transitionPaymentIntent(
        client,
        intent,
        'REQUIRES_PAYMENT',
        {type: 'SYSTEM'},
        'Billing collection ready',
      );

      const resolved = await providerRouter.resolve({
        organizationId,
        environment: resolvePaymentEnvironment(),
        currencyCode: currency,
        requiredCapability: 'payment.authorize',
      });

      const a = await client.query(
        `INSERT INTO payment_attempts (
           organization_id, payment_session_id, payment_intent_id, attempt_number,
           status, provider_code, payment_method_type_code, started_at, metadata_json
         ) VALUES ($1,NULL,$2,1,'PROCESSING',$3,'CARD',NOW(),$4)
         RETURNING *`,
        [organizationId, intent.id, resolved.providerCode, JSON.stringify({source: 'billing'})],
      );
      const attempt = a.rows[0];

      intent = await transitionPaymentIntent(
        client,
        intent,
        'PROCESSING',
        {type: 'SYSTEM'},
        'Billing collection submitted',
      );

      const result = await providerRouter.run({
        resolved,
        operation: 'AUTHORIZE',
        paymentIntentId: intent.id,
        paymentAttemptId: attempt.id,
        idempotencyKey: input.idempotencyKey,
        client,
        fn: () =>
          resolved.adapter.authorize({
            organizationId,
            paymentIntentId: intent.id,
            paymentAttemptId: attempt.id,
            amountMinor,
            currencyCode: currency,
            paymentMethodTypeCode: 'CARD',
            paymentMethodToken: input.paymentMethodToken,
            idempotencyKey: input.idempotencyKey,
          }),
      });

      if (result.status === 'SUCCEEDED') {
        await client.query(
          `UPDATE payment_attempts
           SET status='SUCCEEDED', provider_reference=$2, finished_at=NOW(), version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null],
        );
        intent = await transitionPaymentIntent(
          client,
          intent,
          'SUCCEEDED',
          {type: 'PROVIDER'},
          'Billing collection succeeded',
          ['succeeded_at=NOW()'],
        );
        const txn = await client.query(
          `INSERT INTO payment_transactions (
             organization_id, merchant_profile_id, payment_session_id, payment_intent_id, payment_attempt_id,
             amount_minor, currency_code, status, provider_code, provider_transaction_id,
             customer_name, customer_email, description, reference, captured_at, metadata_json
           ) VALUES ($1,$2,NULL,$3,$4,$5,$6,'SUCCEEDED',$7,$8,$9,$10,$11,$12,NOW(),$13)
           RETURNING *`,
          [
            organizationId,
            merchant.id,
            intent.id,
            attempt.id,
            amountMinor,
            currency,
            result.providerCode,
            result.providerTransactionId || result.providerReference || null,
            intent.customer_name,
            intent.customer_email,
            intent.description,
            intent.reference,
            JSON.stringify({source: 'billing', sandbox: result.providerCode === 'sandbox'}),
          ],
        );
        await ledgerService.postPaymentSucceededWithClient(client, {
          organizationId,
          paymentIntentId: intent.id,
          amountMinor: String(amountMinor),
          currencyCode: currency,
          environment: resolved.environment,
        });
        await emitPaymentEvent(
          client,
          'payment.succeeded',
          organizationId,
          intent,
          {
            payment_transaction_id: txn.rows[0].id,
            payment_attempt_id: attempt.id,
            source: 'billing',
            provider_code: result.providerCode,
          },
          `billing-payment-succeeded-${intent.id}`,
        );
        return {
          status: 'SUCCEEDED' as const,
          intent: money(intent),
          attempt,
          transaction: money(txn.rows[0]),
          provider_code: result.providerCode,
          provider_reference: result.providerReference,
          provider_transaction_id: result.providerTransactionId,
          query_before_retry: false,
        };
      }

      if (result.status === 'AMBIGUOUS' || result.queryBeforeRetry) {
        const failureCode = result.failureCode || 'PROVIDER_AMBIGUOUS';
        const failureMessage =
          result.failureMessage || 'Provider outcome ambiguous — query before retry; do not re-charge';
        await client.query(
          `UPDATE payment_attempts
           SET status='FAILED', provider_reference=$2, failure_code=$3, failure_message=$4,
               finished_at=NOW(), version=version+1, updated_at=NOW()
           WHERE id=$1`,
          [attempt.id, result.providerReference || null, failureCode, failureMessage],
        );
        intent = await transitionPaymentIntent(
          client,
          intent,
          'FAILED',
          {type: 'PROVIDER'},
          failureMessage,
          ['failed_at=NOW()', 'failure_code=$5', 'failure_message=$6'],
          [failureCode, failureMessage],
        );
        return {
          status: 'AMBIGUOUS' as const,
          intent: money(intent),
          attempt,
          transaction: null,
          provider_code: result.providerCode,
          provider_reference: result.providerReference,
          failure_code: failureCode,
          failure_message: failureMessage,
          query_before_retry: true,
        };
      }

      await client.query(
        `UPDATE payment_attempts
         SET status='FAILED', provider_reference=$2, failure_code=$3, failure_message=$4,
             finished_at=NOW(), version=version+1, updated_at=NOW()
         WHERE id=$1`,
        [
          attempt.id,
          result.providerReference || null,
          result.failureCode || 'PROVIDER_FAILED',
          result.failureMessage || 'Payment failed',
        ],
      );
      intent = await transitionPaymentIntent(
        client,
        intent,
        'FAILED',
        {type: 'PROVIDER'},
        result.failureMessage || 'Provider reported failure',
        ['failed_at=NOW()', 'failure_code=$5', 'failure_message=$6'],
        [result.failureCode || 'PROVIDER_FAILED', result.failureMessage || 'Payment failed'],
      );
      return {
        status: 'FAILED' as const,
        intent: money(intent),
        attempt,
        transaction: null,
        provider_code: result.providerCode,
        provider_reference: result.providerReference,
        failure_code: result.failureCode,
        failure_message: result.failureMessage,
        query_before_retry: false,
      };
    });
  },
};
