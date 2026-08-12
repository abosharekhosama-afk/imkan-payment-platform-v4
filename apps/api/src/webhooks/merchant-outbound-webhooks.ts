import crypto from 'node:crypto';
import {config} from '../config.js';
import {AppError, notFound} from '../foundation/errors.js';
import {encryptSecret, decryptSecret, randomToken} from '../foundation/crypto.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {pgQuery, type PgClient} from '../infrastructure/db/postgres.js';
import {assertSafePublicUrl} from '../security/url-safety.js';

export const MERCHANT_WEBHOOK_EVENT_TYPES = [
  'payment.succeeded',
  'payment.failed',
  'refund.succeeded',
] as const;

export type MerchantWebhookEventType = (typeof MERCHANT_WEBHOOK_EVENT_TYPES)[number];

const MAX_ATTEMPTS = 10;

function backoffSeconds(attempt: number): number {
  return Math.min(3600, Math.pow(2, Math.max(0, attempt - 1)) * 5);
}

function assertWebhookUrl(raw: string): string {
  if (config.isProduction) {
    const safe = assertSafePublicUrl(raw, 'url');
    if (!safe) throw new AppError('UNSAFE_URL', 'url is required', 400);
    return safe;
  }
  let parsed: URL;
  try {
    parsed = new URL(String(raw).trim());
  } catch {
    throw new AppError('UNSAFE_URL', 'url is not a valid URL', 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError('UNSAFE_URL', 'url must use http or https', 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError('UNSAFE_URL', 'url must not include credentials', 400);
  }
  return parsed.toString();
}

function normalizeEvents(events?: string[] | null): string[] {
  const list = Array.isArray(events) && events.length ? events : [...MERCHANT_WEBHOOK_EVENT_TYPES];
  const allowed = new Set<string>(MERCHANT_WEBHOOK_EVENT_TYPES);
  const out = [...new Set(list.map((e) => String(e).trim()).filter((e) => allowed.has(e) || e === '*'))];
  if (!out.length) {
    throw new AppError('WEBHOOK_EVENTS_REQUIRED', 'At least one subscribed event is required', 400);
  }
  return out;
}

function publicEndpoint(row: any) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    url: row.url,
    description: row.description,
    subscribed_events: row.subscribed_events,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    secret_hint: 'whsec_••••••••',
  };
}

function parsePayload(value: unknown): Record<string, any> {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value as Record<string, any>;
  return {};
}

export function isMerchantDeliverableEvent(eventType: string): boolean {
  return (MERCHANT_WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType);
}

export const merchantOutboundWebhooks = {
  async listEndpoints(organizationId: string) {
    const r = await pgQuery(
      `SELECT * FROM merchant_webhook_endpoints WHERE organization_id=$1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return r.rows.map(publicEndpoint);
  },

  async createEndpoint(
    organizationId: string,
    input: {
      url: string;
      description?: string | null;
      subscribedEvents?: string[] | null;
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    const url = assertWebhookUrl(input.url);
    const subscribed = normalizeEvents(input.subscribedEvents);
    const secret = `whsec_${randomToken(24)}`;
    const r = await pgQuery(
      `INSERT INTO merchant_webhook_endpoints (
         organization_id, url, description, secret_encrypted, subscribed_events, created_by_user_id
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
       RETURNING *`,
      [
        organizationId,
        url,
        input.description?.trim() || null,
        encryptSecret(secret),
        JSON.stringify(subscribed),
        input.actorUserId || null,
      ],
    );
    await writeAuditEvent({
      organizationId,
      actorUserId: input.actorUserId,
      action: 'merchant_webhook.created',
      resourceType: 'merchant_webhook_endpoint',
      resourceId: r.rows[0].id,
      requestId: input.requestId,
      after: {url, subscribed_events: subscribed},
    });
    return {...publicEndpoint(r.rows[0]), secret};
  },

  async updateEndpoint(
    organizationId: string,
    endpointId: string,
    input: {
      url?: string;
      description?: string | null;
      subscribedEvents?: string[] | null;
      status?: 'ACTIVE' | 'DISABLED';
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    const existing = await pgQuery(`SELECT * FROM merchant_webhook_endpoints WHERE id=$1 AND organization_id=$2`, [
      endpointId,
      organizationId,
    ]);
    if (!existing.rows[0]) throw notFound('Webhook endpoint not found', 'WEBHOOK_ENDPOINT_NOT_FOUND');
    const url = input.url !== undefined ? assertWebhookUrl(input.url) : existing.rows[0].url;
    const subscribed =
      input.subscribedEvents !== undefined
        ? normalizeEvents(input.subscribedEvents)
        : existing.rows[0].subscribed_events;
    const status = input.status || existing.rows[0].status;
    const description =
      input.description !== undefined ? input.description?.trim() || null : existing.rows[0].description;
    const r = await pgQuery(
      `UPDATE merchant_webhook_endpoints
       SET url=$3, description=$4, subscribed_events=$5::jsonb, status=$6, updated_at=NOW()
       WHERE id=$1 AND organization_id=$2
       RETURNING *`,
      [endpointId, organizationId, url, description, JSON.stringify(subscribed), status],
    );
    await writeAuditEvent({
      organizationId,
      actorUserId: input.actorUserId,
      action: 'merchant_webhook.updated',
      resourceType: 'merchant_webhook_endpoint',
      resourceId: endpointId,
      requestId: input.requestId,
    });
    return publicEndpoint(r.rows[0]);
  },

  async listDeliveries(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT id, endpoint_id, outbox_event_id, event_type, status, attempt, response_code,
              last_error, next_retry_at, delivered_at, created_at
       FROM merchant_webhook_deliveries
       WHERE organization_id=$1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async retryDelivery(deliveryId: string, opts?: {organizationId?: string; actorUserId?: string}) {
    const params: unknown[] = [deliveryId];
    let orgClause = '';
    if (opts?.organizationId) {
      params.push(opts.organizationId);
      orgClause = ` AND organization_id=$${params.length}`;
    }
    const r = await pgQuery(
      `UPDATE merchant_webhook_deliveries
       SET status='PENDING', next_retry_at=NOW(), updated_at=NOW()
       WHERE id=$1${orgClause} AND status IN ('FAILED', 'RETRYING')
       RETURNING *`,
      params,
    );
    if (!r.rows[0]) {
      throw new AppError('WEBHOOK_DELIVERY_NOT_RETRYABLE', 'This webhook delivery is not currently eligible for retry.', 409);
    }
    if (opts?.actorUserId) {
      await writeAuditEvent({
        organizationId: r.rows[0].organization_id,
        actorUserId: opts.actorUserId,
        action: 'merchant_webhook.delivery_retry',
        resourceType: 'merchant_webhook_delivery',
        resourceId: deliveryId,
      });
    }
    void this.deliverPending(1);
    return r.rows[0];
  },

  async retryFailedDeliveries(filter?: {organizationId?: string; limit?: number; actorUserId?: string}) {
    const params: unknown[] = [];
    let where = `WHERE status='FAILED'`;
    if (filter?.organizationId) {
      params.push(filter.organizationId);
      where += ` AND organization_id=$${params.length}`;
    }
    const limit = Math.min(filter?.limit ?? 50, 200);
    params.push(limit);
    const r = await pgQuery(
      `UPDATE merchant_webhook_deliveries
       SET status='PENDING', next_retry_at=NOW(), updated_at=NOW()
       WHERE id IN (
         SELECT id FROM merchant_webhook_deliveries ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}
       )
       RETURNING id`,
      params,
    );
    if (filter?.actorUserId && r.rows.length) {
      await writeAuditEvent({
        organizationId: filter.organizationId || null,
        actorUserId: filter.actorUserId,
        action: 'merchant_webhook.deliveries_retry_failed',
        resourceType: 'merchant_webhook_delivery',
        resourceId: r.rows[0].id,
        after: {count: r.rows.length},
      });
    }
    if (r.rows.length) void this.deliverPending(Math.min(r.rows.length, 25));
    return {retried: r.rows.length};
  },

  /** Enqueue deliveries for a claimed outbox event (inside outbox worker transaction). */
  async enqueueFromOutbox(
    client: PgClient,
    event: {
      id: string;
      organization_id: string | null;
      event_type: string;
      payload_json: unknown;
    },
  ) {
    if (!event.organization_id || !isMerchantDeliverableEvent(event.event_type)) return 0;
    const endpoints = await client.query<{id: string; subscribed_events: unknown}>(
      `SELECT id, subscribed_events FROM merchant_webhook_endpoints
       WHERE organization_id=$1 AND status='ACTIVE'`,
      [event.organization_id],
    );
    let created = 0;
    for (const ep of endpoints.rows) {
      const raw = ep.subscribed_events;
      const events: string[] = Array.isArray(raw)
        ? raw.map(String)
        : typeof raw === 'string'
          ? (() => {
              try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })()
          : [];
      if (!events.includes('*') && !events.includes(event.event_type)) continue;
      const ins = await client.query(
        `INSERT INTO merchant_webhook_deliveries (
           organization_id, endpoint_id, outbox_event_id, event_type, status, next_retry_at
         ) VALUES ($1,$2,$3,$4,'PENDING',NOW())
         ON CONFLICT (endpoint_id, outbox_event_id) DO NOTHING`,
        [event.organization_id, ep.id, event.id, event.event_type],
      );
      created += ins.rowCount || 0;
    }
    return created;
  },

  async deliverPending(limit = 25) {
    const claimed = await pgQuery(
      `SELECT d.id, d.organization_id, d.endpoint_id, d.outbox_event_id, d.event_type, d.attempt,
              e.aggregate_type, e.aggregate_id, e.payload_json, e.created_at AS event_created_at,
              w.url, w.secret_encrypted
       FROM merchant_webhook_deliveries d
       JOIN outbox_events e ON e.id = d.outbox_event_id
       JOIN merchant_webhook_endpoints w ON w.id = d.endpoint_id
       WHERE d.status IN ('PENDING', 'RETRYING')
         AND w.status = 'ACTIVE'
         AND d.next_retry_at <= NOW()
       ORDER BY d.next_retry_at ASC
       LIMIT $1`,
      [limit],
    );

    for (const row of claimed.rows) {
      await this.deliverOne(row);
    }
  },

  async deliverOne(row: any) {
    const bodyObj = await this.buildSignedBody(row);
    const body = JSON.stringify(bodyObj);
    let secret: string;
    try {
      secret = decryptSecret(row.secret_encrypted);
    } catch (error: any) {
      await pgQuery(
        `UPDATE merchant_webhook_deliveries
         SET status='FAILED', attempt=attempt+1, last_error=$2, updated_at=NOW()
         WHERE id=$1`,
        [row.id, String(error?.message || 'SECRET_DECRYPT_FAILED').slice(0, 500)],
      );
      return;
    }
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const attempt = Number(row.attempt || 0) + 1;
    let responseCode: number | undefined;
    let errorMessage: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(row.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'IMKAN-Payments-Webhooks/1.0',
          'x-webhook-id': String(row.outbox_event_id),
          'x-webhook-event': String(row.event_type),
          'x-webhook-signature': `sha256=${signature}`,
          'x-webhook-timestamp': new Date().toISOString(),
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      responseCode = response.status;
      const responseBody = (await response.text()).slice(0, 2000);
      if (response.ok) {
        await pgQuery(
          `UPDATE merchant_webhook_deliveries
           SET attempt=$2, status='DELIVERED', response_code=$3, last_error=NULL,
               delivered_at=NOW(), next_retry_at=NOW(), updated_at=NOW()
           WHERE id=$1`,
          [row.id, attempt, responseCode],
        );
        return;
      }
      errorMessage = `HTTP_${response.status}:${responseBody.slice(0, 200)}`;
    } catch (error: any) {
      errorMessage = String(error?.message || 'DELIVERY_FAILED').slice(0, 500);
    }

    const status = attempt >= MAX_ATTEMPTS ? 'FAILED' : 'RETRYING';
    const next = new Date(Date.now() + backoffSeconds(attempt) * 1000);
    await pgQuery(
      `UPDATE merchant_webhook_deliveries
       SET attempt=$2, status=$3, response_code=$4, last_error=$5,
           next_retry_at=$6, updated_at=NOW()
       WHERE id=$1`,
      [row.id, attempt, status, responseCode ?? null, errorMessage || null, status === 'FAILED' ? next : next],
    );
  },

  async buildSignedBody(row: any) {
    const payload = parsePayload(row.payload_json);
    let externalInvoiceRef = payload.external_invoice_ref ?? null;
    let paidAt = payload.paid_at ?? null;
    let amountMinor = payload.amount_minor != null ? String(payload.amount_minor) : null;
    let currencyCode = payload.currency_code || payload.currency || null;
    let status = payload.status || null;
    const paymentIntentId = payload.payment_intent_id || (row.aggregate_type === 'payment_intent' ? row.aggregate_id : null);

    if (paymentIntentId && (!externalInvoiceRef || !paidAt || !amountMinor)) {
      const intent = await pgQuery(
        `SELECT pi.amount_minor, pi.currency_code, pi.status, pi.succeeded_at, pi.payment_link_id,
                pl.external_invoice_ref
         FROM payment_intents pi
         LEFT JOIN payment_links pl ON pl.id = pi.payment_link_id
         WHERE pi.id=$1 AND pi.organization_id=$2`,
        [paymentIntentId, row.organization_id],
      );
      if (intent.rows[0]) {
        const i = intent.rows[0];
        amountMinor = amountMinor || (i.amount_minor != null ? String(i.amount_minor) : null);
        currencyCode = currencyCode || i.currency_code;
        status = status || i.status;
        paidAt = paidAt || i.succeeded_at || null;
        externalInvoiceRef = externalInvoiceRef || i.external_invoice_ref || null;
      }
    }

    return {
      id: row.outbox_event_id,
      type: row.event_type,
      created_at: row.event_created_at,
      data: {
        payment_intent_id: paymentIntentId,
        refund_id: payload.refund_id || null,
        external_invoice_ref: externalInvoiceRef,
        amount_minor: amountMinor,
        currency_code: currencyCode,
        status,
        paid_at: paidAt,
        ...payload,
      },
    };
  },
};
