/**
 * Complete checkout artifacts after a payment intent reaches SUCCEEDED
 * (Stripe Elements webhooks / return-page sync). Idempotent.
 */
import type {PgClient} from '../infrastructure/db/postgres.js';
import {paymentLinksService} from '../payments/payment-links-service.js';

export async function finalizeCheckoutArtifacts(
  client: PgClient,
  input: {
    organizationId: string;
    paymentIntentId: string;
    providerCode?: string;
    providerReference?: string | null;
  },
): Promise<{finalized: boolean; reason: string}> {
  const intentRes = await client.query(
    `SELECT id, organization_id, merchant_profile_id, payment_link_id, payment_order_id,
            amount_minor, currency_code, status, customer_name, customer_email, description, reference
     FROM payment_intents
     WHERE id=$1 AND organization_id=$2
     FOR UPDATE`,
    [input.paymentIntentId, input.organizationId],
  );
  const intent = intentRes.rows[0];
  if (!intent) return {finalized: false, reason: 'payment_not_found'};
  if (intent.status !== 'SUCCEEDED') return {finalized: false, reason: 'intent_not_succeeded'};

  const existingTxn = await client.query(
    `SELECT id FROM payment_transactions
     WHERE payment_intent_id=$1 AND organization_id=$2 AND status='SUCCEEDED'
     LIMIT 1`,
    [input.paymentIntentId, input.organizationId],
  );
  if (existingTxn.rows[0]) {
    // Still ensure link consumption if a prior path skipped it.
    if (intent.payment_link_id) {
      const link = await client.query(
        `SELECT id, use_count, max_uses, one_time, status FROM payment_links
         WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [intent.payment_link_id, input.organizationId],
      );
      const l = link.rows[0];
      if (l && l.status === 'ACTIVE' && (l.one_time === true || (l.max_uses != null && Number(l.use_count) < Number(l.max_uses)))) {
        await paymentLinksService.recordSuccessfulUse(client, intent.payment_link_id, input.organizationId);
      }
    }
    await client.query(
      `UPDATE payment_sessions
       SET status='COMPLETED', completed_at=COALESCE(completed_at, NOW()), version=version+1, updated_at=NOW()
       WHERE payment_intent_id=$1 AND organization_id=$2 AND status='OPEN'`,
      [input.paymentIntentId, input.organizationId],
    );
    if (intent.payment_order_id) {
      await client.query(
        `UPDATE payment_orders SET status='PAID', updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status <> 'PAID'`,
        [intent.payment_order_id, input.organizationId],
      );
    }
    return {finalized: true, reason: 'already_had_transaction'};
  }

  const sessionRes = await client.query(
    `SELECT * FROM payment_sessions
     WHERE payment_intent_id=$1 AND organization_id=$2
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [input.paymentIntentId, input.organizationId],
  );
  const session = sessionRes.rows[0];
  if (!session) return {finalized: false, reason: 'session_not_found'};

  let attemptId: string | null = null;
  const attemptRes = await client.query(
    `SELECT id FROM payment_attempts
     WHERE payment_intent_id=$1 AND organization_id=$2
     ORDER BY created_at DESC LIMIT 1`,
    [input.paymentIntentId, input.organizationId],
  );
  if (attemptRes.rows[0]) {
    attemptId = attemptRes.rows[0].id;
    await client.query(
      `UPDATE payment_attempts
       SET status='SUCCEEDED', provider_reference=COALESCE($2, provider_reference),
           finished_at=COALESCE(finished_at, NOW()), version=version+1, updated_at=NOW()
       WHERE id=$1`,
      [attemptId, input.providerReference || null],
    );
  } else {
    const nextNum = await client.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS n FROM payment_attempts WHERE payment_intent_id=$1`,
      [input.paymentIntentId],
    );
    const created = await client.query(
      `INSERT INTO payment_attempts (
         organization_id, payment_intent_id, payment_session_id, attempt_number, status,
         provider_code, provider_reference, started_at, finished_at, metadata_json
       ) VALUES ($1,$2,$3,$4,'SUCCEEDED',$5,$6,NOW(),NOW(),$7)
       RETURNING id`,
      [
        input.organizationId,
        input.paymentIntentId,
        session.id,
        nextNum.rows[0].n,
        input.providerCode || 'stripe',
        input.providerReference || null,
        JSON.stringify({source: 'provider_finalize'}),
      ],
    );
    attemptId = created.rows[0].id;
  }

  await client.query(
    `INSERT INTO payment_transactions (
       organization_id, merchant_profile_id, payment_link_id, payment_order_id,
       payment_session_id, payment_intent_id, payment_attempt_id,
       amount_minor, currency_code, status, provider_code, provider_transaction_id,
       customer_name, customer_email, description, reference, captured_at, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'SUCCEEDED',$10,$11,$12,$13,$14,$15,NOW(),$16)`,
    [
      input.organizationId,
      intent.merchant_profile_id,
      intent.payment_link_id,
      intent.payment_order_id,
      session.id,
      intent.id,
      attemptId,
      intent.amount_minor,
      intent.currency_code,
      input.providerCode || 'stripe',
      input.providerReference || null,
      intent.customer_name,
      intent.customer_email,
      intent.description,
      intent.reference,
      JSON.stringify({source: 'provider_finalize'}),
    ],
  );

  await client.query(
    `UPDATE payment_sessions
     SET status='COMPLETED', completed_at=NOW(), version=version+1, updated_at=NOW()
     WHERE id=$1`,
    [session.id],
  );
  if (intent.payment_order_id) {
    await client.query(`UPDATE payment_orders SET status='PAID', updated_at=NOW() WHERE id=$1`, [
      intent.payment_order_id,
    ]);
  }
  if (intent.payment_link_id) {
    await paymentLinksService.recordSuccessfulUse(client, intent.payment_link_id, input.organizationId);
  }

  return {finalized: true, reason: 'finalized'};
}
