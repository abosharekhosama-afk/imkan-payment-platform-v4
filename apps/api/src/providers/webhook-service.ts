import crypto from 'node:crypto';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {emitOutboxEvent, writeSecurityEvent} from '../foundation/audit.js';
import {AppError} from '../foundation/errors.js';
import type {ProviderEnvironment} from './adapter.js';
import {getProviderAdapter} from './registry.js';
import {resolvePaymentEnvironment} from './router.js';
import {applyProviderWebhookToPaymentIntent} from './webhook-state-apply.js';
import './registry.js';

function payloadHash(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

function redactBody(rawBody: string): string {
  // Keep structure for ops; truncate large bodies; never store secrets beyond short preview.
  if (rawBody.length <= 4000) return rawBody;
  return `${rawBody.slice(0, 4000)}…[truncated]`;
}

function pickHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const allow = [
    'x-sandbox-signature',
    'x-sandbox-timestamp',
    'x-sandbox-event-id',
    'x-sandbox-nonce',
    'content-type',
    'user-agent',
  ];
  const out: Record<string, string> = {};
  for (const key of allow) {
    const v = headers[key] ?? headers[key.toLowerCase()];
    if (v !== undefined) out[key] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  return out;
}

export const providerWebhookService = {
  /**
   * Ingress: verify → replay/nonce → dedupe → normalize → domain event → outbox.
   * Never sets signature_valid=true without cryptographic verification success.
   */
  async ingest(input: {
    providerCode: string;
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    environment?: ProviderEnvironment;
    ip?: string;
  }) {
    const environment = input.environment || resolvePaymentEnvironment();
    const provider = await pgQuery(`SELECT id, code, status FROM providers WHERE code=$1`, [input.providerCode]);
    if (!provider.rows[0]) throw new AppError('PROVIDER_NOT_FOUND', 'Unknown provider', 404);
    if (provider.rows[0].status !== 'ACTIVE') {
      throw new AppError('PROVIDER_DISABLED', 'Provider is disabled', 503);
    }

    const providerId = provider.rows[0].id as string;
    const adapter = getProviderAdapter(input.providerCode);
    const verification = await adapter.verifyWebhook({
      headers: input.headers,
      rawBody: input.rawBody,
      environment,
    });

    const hash = payloadHash(input.rawBody);
    const headersJson = pickHeaders(input.headers);

    if (!verification.valid) {
      const eventId = verification.providerEventId || `invalid-${hash.slice(0, 24)}`;
      try {
        await pgQuery(
          `INSERT INTO provider_webhook_events (
             provider_id, provider_event_id, environment, signature_valid, signature_error,
             payload_hash, raw_body_redacted, headers_json, processing_status, attempts, last_error
           ) VALUES ($1,$2,$3,FALSE,$4,$5,$6,$7,'REJECTED',1,$4)
           ON CONFLICT (provider_id, provider_event_id) DO UPDATE
             SET attempts = provider_webhook_events.attempts + 1,
                 last_error = EXCLUDED.last_error,
                 updated_at = NOW()`,
          [providerId, eventId, environment, verification.error, hash, redactBody(input.rawBody), JSON.stringify(headersJson)],
        );
      } catch {
        // Best-effort audit of rejects
      }
      await writeSecurityEvent({
        eventType: 'provider.webhook.rejected',
        metadata: {provider_code: input.providerCode, reason: verification.error, ip: input.ip || null},
      });
      const {incrMetric} = await import('../observability/metrics.js');
      incrMetric('webhook_failures_total', {provider: input.providerCode, reason: 'signature_invalid'});
      throw new AppError('WEBHOOK_SIGNATURE_INVALID', verification.error, 401);
    }

    const event = verification.event;

    return withPgTransaction(async (client) => {
      // Deduplicate by provider_event_id first (safe under replay of identical deliveries)
      const existing = await client.query(
        `SELECT id, processing_status FROM provider_webhook_events
         WHERE provider_id=$1 AND provider_event_id=$2`,
        [providerId, event.providerEventId],
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE provider_webhook_events
           SET attempts = attempts + 1, processing_status='DUPLICATE', updated_at=NOW()
           WHERE id=$1`,
          [existing.rows[0].id],
        );
        await writeSecurityEvent(
          {
            organizationId: event.organizationId || null,
            eventType: 'provider.webhook.duplicate',
            metadata: {provider_code: input.providerCode, provider_event_id: event.providerEventId},
          },
          client,
        );
        return {status: 'DUPLICATE' as const, reason: 'event_id', id: existing.rows[0].id};
      }

      // Replay protection via nonce store (new event ids must not reuse nonces).
      // Check-then-insert avoids 23505 aborting the surrounding transaction (25P02).
      if (verification.nonce) {
        const seen = await client.query(
          `SELECT id FROM provider_webhook_nonces WHERE provider_id=$1 AND nonce=$2`,
          [providerId, verification.nonce],
        );
        if (seen.rows[0]) {
          await client.query(
            `INSERT INTO provider_webhook_events (
               provider_id, organization_id, provider_event_id, environment, signature_valid,
               payload_hash, raw_body_redacted, headers_json, normalized_event_type,
               normalized_payload_json, processing_status, attempts, last_error,
               related_payment_intent_id, related_provider_reference
             ) VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9,'DUPLICATE',1,'Replayed nonce',$10,$11)`,
            [
              providerId,
              event.organizationId || null,
              event.providerEventId,
              environment,
              hash,
              redactBody(input.rawBody),
              JSON.stringify(headersJson),
              event.eventType,
              JSON.stringify(event.payload),
              event.paymentIntentId || null,
              event.providerReference || null,
            ],
          );
          await writeSecurityEvent(
            {
              organizationId: event.organizationId || null,
              eventType: 'provider.webhook.replay',
              metadata: {provider_code: input.providerCode, provider_event_id: event.providerEventId},
            },
            client,
          );
          return {status: 'DUPLICATE' as const, reason: 'nonce_replay'};
        }
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await client.query(
          `INSERT INTO provider_webhook_nonces (provider_id, nonce, expires_at) VALUES ($1,$2,$3)`,
          [providerId, verification.nonce, expiresAt],
        );
      }

      const inserted = await client.query(
        `INSERT INTO provider_webhook_events (
           provider_id, organization_id, provider_event_id, environment, signature_valid,
           payload_hash, raw_body_redacted, headers_json, normalized_event_type,
           normalized_payload_json, processing_status, attempts,
           related_payment_intent_id, related_provider_reference
         ) VALUES ($1,$2,$3,$4,TRUE,$5,$6,$7,$8,$9,'PROCESSING',1,$10,$11)
         RETURNING *`,
        [
          providerId,
          event.organizationId || null,
          event.providerEventId,
          environment,
          hash,
          redactBody(input.rawBody),
          JSON.stringify(headersJson),
          event.eventType,
          JSON.stringify(event.payload),
          event.paymentIntentId || null,
          event.providerReference || null,
        ],
      );

      const row = inserted.rows[0];

      // P15.0: resolve tenant from payment_intents — never from external payload org claim.
      let trustedOrgId: string | null = null;
      let paymentIntentId: string | null = event.paymentIntentId || null;

      if (paymentIntentId) {
        const piOrg = await client.query<{organization_id: string}>(
          `SELECT organization_id FROM payment_intents WHERE id=$1`,
          [paymentIntentId],
        );
        trustedOrgId = piOrg.rows[0]?.organization_id || null;
        if (!trustedOrgId) {
          await client.query(
            `UPDATE provider_webhook_events
             SET processing_status='REJECTED', last_error=$2, updated_at=NOW()
             WHERE id=$1`,
            [row.id, 'payment_intent_not_found_for_tenant_resolve'],
          );
          return {accepted: false, reason: 'payment_intent_not_found', event_id: row.id};
        }
      } else if (event.providerReference) {
        // Provider-agnostic correlation (PayTabs tran_ref → payment_attempts.provider_reference).
        const correlated = await client.query<{payment_intent_id: string; organization_id: string}>(
          `SELECT pa.payment_intent_id, pi.organization_id
           FROM payment_attempts pa
           JOIN payment_intents pi ON pi.id = pa.payment_intent_id
           WHERE pa.provider_reference = $1
           ORDER BY pa.created_at DESC
           LIMIT 1`,
          [event.providerReference],
        );
        if (correlated.rows[0]) {
          paymentIntentId = correlated.rows[0].payment_intent_id;
          trustedOrgId = correlated.rows[0].organization_id;
        }
      }

      if (trustedOrgId) {
        await client.query(`UPDATE provider_webhook_events SET organization_id=$2 WHERE id=$1`, [
          row.id,
          trustedOrgId,
        ]);
      }

      const applied = await applyProviderWebhookToPaymentIntent(client, {
        organizationId: trustedOrgId,
        paymentIntentId,
        eventType: event.eventType,
        providerEventId: event.providerEventId,
        providerReference: event.providerReference || null,
        amountMinor: event.payload?.amount_minor != null ? String(event.payload.amount_minor) : null,
        currencyCode: event.payload?.currency_code != null ? String(event.payload.currency_code) : null,
      });

      await emitOutboxEvent(
        {
          organizationId: trustedOrgId,
          eventType: 'provider.webhook.received',
          aggregateType: 'provider_webhook_event',
          aggregateId: row.id,
          payload: {
            provider_code: input.providerCode,
            provider_event_id: event.providerEventId,
            normalized_event_type: event.eventType,
            provider_reference: event.providerReference || null,
            payment_intent_id: event.paymentIntentId || null,
            environment,
            state_apply: applied,
          },
          idempotencyKey: `provider-webhook-${providerId}-${event.providerEventId}`,
        },
        client,
      );

      await client.query(
        `UPDATE provider_webhook_events
         SET processing_status='PROCESSED', processed_at=NOW(), updated_at=NOW()
         WHERE id=$1`,
        [row.id],
      );

      await writeSecurityEvent(
        {
          organizationId: trustedOrgId,
          eventType: 'provider.webhook.processed',
          metadata: {
            provider_code: input.providerCode,
            provider_event_id: event.providerEventId,
            webhook_event_id: row.id,
            state_apply: applied,
          },
        },
        client,
      );

      return {
        status: 'PROCESSED' as const,
        id: row.id,
        normalized_event_type: event.eventType,
        provider_event_id: event.providerEventId,
        state_apply: applied,
      };
    });
  },

  async listForOrg(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT w.id, w.organization_id, w.provider_event_id, w.environment, w.signature_valid,
              w.normalized_event_type, w.processing_status, w.attempts, w.received_at, w.processed_at,
              w.last_error, p.code AS provider_code
       FROM provider_webhook_events w
       JOIN providers p ON p.id = w.provider_id
       WHERE w.organization_id=$1
       ORDER BY w.received_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },
};
