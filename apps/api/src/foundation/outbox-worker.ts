import {config} from '../config.js';
import {withPgTransaction} from '../infrastructure/db/postgres.js';
import {handleEmailOutboxEvent, isDeliverableEmailEvent} from '../platform/email-outbox-handlers.js';
import {
  isMerchantDeliverableEvent,
  merchantOutboundWebhooks,
} from '../webhooks/merchant-outbound-webhooks.js';

/**
 * Phase 2 outbox worker — processes PENDING domain events.
 * P16.1: email/invitation events use vendor-neutral SMTP when configured.
 * P16.8: payment/refund events enqueue HMAC merchant webhook deliveries.
 */
export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start() {
    if (!config.outboxWorkerEnabled || this.timer) return;
    this.timer = setInterval(() => void this.tick(), config.outboxWorkerIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await withPgTransaction(async (client) => {
        const claimed = await client.query<{
          id: string;
          organization_id: string | null;
          event_type: string;
          aggregate_type: string;
          aggregate_id: string;
          payload_json: unknown;
          attempts: number;
        }>(
          `SELECT id, organization_id, event_type, aggregate_type, aggregate_id, payload_json, attempts
           FROM outbox_events
           WHERE status='PENDING' AND available_at <= NOW()
           ORDER BY created_at
           LIMIT 20
           FOR UPDATE SKIP LOCKED`,
        );
        for (const row of claimed.rows) {
          await client.query(`UPDATE outbox_events SET status='PROCESSING', attempts=attempts+1 WHERE id=$1`, [
            row.id,
          ]);
          try {
            await this.handle(client, row);
            await client.query(
              `UPDATE outbox_events SET status='PROCESSED', processed_at=NOW(), last_error=NULL WHERE id=$1`,
              [row.id],
            );
          } catch (error: any) {
            const attempts = row.attempts + 1;
            const status = attempts >= 8 ? 'FAILED' : 'PENDING';
            const delayMinutes = Math.min(60, attempts * 2);
            if (status === 'FAILED') {
              const {incrMetric} = await import('../observability/metrics.js');
              incrMetric('outbox_failures_total', {event_type: row.event_type});
            }
            await client.query(
              `UPDATE outbox_events
               SET status=$2, last_error=$3, available_at=NOW() + ($4 || ' minutes')::interval
               WHERE id=$1`,
              [row.id, status, String(error?.message || error).slice(0, 1000), String(delayMinutes)],
            );
          }
        }
      });
      // HTTP delivery outside the claim transaction
      await merchantOutboundWebhooks.deliverPending();
    } finally {
      this.running = false;
    }
  }

  private async handle(
    client: import('../infrastructure/db/postgres.js').PgClient,
    row: {
      id: string;
      organization_id: string | null;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
      payload_json: unknown;
    },
  ) {
    if (isDeliverableEmailEvent(row.event_type)) {
      await handleEmailOutboxEvent(row.event_type, row.payload_json);
      return;
    }
    if (isMerchantDeliverableEvent(row.event_type)) {
      await merchantOutboundWebhooks.enqueueFromOutbox(client, row);
      return;
    }
    if (
      row.event_type.startsWith('user.') ||
      row.event_type.startsWith('security.') ||
      row.event_type.startsWith('kyb.') ||
      row.event_type.startsWith('bank_account.') ||
      row.event_type.startsWith('payment.') ||
      row.event_type.startsWith('payment_link.') ||
      row.event_type.startsWith('billing.') ||
      row.event_type.startsWith('provider.') ||
      row.event_type.startsWith('refund.')
    ) {
      // Domain events retained; no external consumer yet.
      return;
    }
    return;
  }
}

export const outboxWorker = new OutboxWorker();
