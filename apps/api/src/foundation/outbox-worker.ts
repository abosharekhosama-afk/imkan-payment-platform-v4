import {config} from '../config.js';
import {withPgTransaction} from '../infrastructure/db/postgres.js';

/**
 * Phase 2 outbox worker — processes PENDING domain events.
 * Email/provider delivery uses adapter stubs only (no invented external APIs).
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
          event_type: string;
          payload_json: unknown;
          attempts: number;
        }>(
          `SELECT id, event_type, payload_json, attempts
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
            await this.handle(row.event_type, row.payload_json);
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
    } finally {
      this.running = false;
    }
  }

  private async handle(eventType: string, _payload: unknown) {
    if (
      eventType.startsWith('email.') ||
      eventType.startsWith('user.') ||
      eventType.startsWith('invitation.') ||
      eventType.startsWith('security.') ||
      eventType.startsWith('kyb.') ||
      eventType.startsWith('bank_account.') ||
      eventType.startsWith('payment.') ||
      eventType.startsWith('payment_link.') ||
      eventType.startsWith('billing.') ||
      eventType.startsWith('provider.')
    ) {
      // Phase 2–4 stub handlers: no external delivery vendor is invented.
      // payment.* payloads are retained for future Books/webhook consumers.
      return;
    }
    return;
  }
}

export const outboxWorker = new OutboxWorker();
