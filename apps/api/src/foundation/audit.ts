import {pgQuery, type PgClient} from '../infrastructure/db/postgres.js';

async function exec(client: PgClient | undefined, text: string, params: unknown[] = []) {
  if (client) return client.query(text, params);
  return pgQuery(text, params);
}

export async function writeAuditEvent(
  input: {
    organizationId?: string | null;
    actorUserId?: string | null;
    action: string;
    resourceType?: string;
    resourceId?: string;
    requestId?: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  },
  client?: PgClient,
) {
  await exec(
    client,
    `INSERT INTO audit_events(
      organization_id, actor_user_id, action, resource_type, resource_id, request_id, before_json, after_json, metadata_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.organizationId || null,
      input.actorUserId || null,
      input.action,
      input.resourceType || null,
      input.resourceId || null,
      input.requestId || null,
      input.before ?? null,
      input.after ?? null,
      input.metadata ?? null,
    ],
  );
}

export async function writeSecurityEvent(
  input: {
    organizationId?: string | null;
    userId?: string | null;
    eventType: string;
    success?: boolean;
    ip?: string;
    userAgent?: string;
    metadata?: unknown;
  },
  client?: PgClient,
) {
  await exec(
    client,
    `INSERT INTO security_events(organization_id, user_id, event_type, success, ip, user_agent, metadata_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.organizationId || null,
      input.userId || null,
      input.eventType,
      input.success !== false,
      input.ip || null,
      input.userAgent || null,
      input.metadata ?? null,
    ],
  );
}

export async function writeLoginEvent(
  input: {
    userId?: string | null;
    organizationId?: string | null;
    emailAttempted?: string;
    success: boolean;
    failureReason?: string;
    ip?: string;
    userAgent?: string;
  },
  client?: PgClient,
) {
  await exec(
    client,
    `INSERT INTO login_events(user_id, organization_id, email_attempted, success, failure_reason, ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      input.userId || null,
      input.organizationId || null,
      input.emailAttempted || null,
      input.success,
      input.failureReason || null,
      input.ip || null,
      input.userAgent || null,
    ],
  );
}

export async function emitOutboxEvent(
  input: {
    organizationId?: string | null;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: unknown;
    idempotencyKey?: string;
  },
  client?: PgClient,
) {
  if (input.idempotencyKey) {
    await exec(
      client,
      `INSERT INTO outbox_events(organization_id, event_type, aggregate_type, aggregate_id, payload_json, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
      [
        input.organizationId || null,
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        input.payload ?? {},
        input.idempotencyKey,
      ],
    );
    return;
  }
  await exec(
    client,
    `INSERT INTO outbox_events(organization_id, event_type, aggregate_type, aggregate_id, payload_json, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,NULL)`,
    [
      input.organizationId || null,
      input.eventType,
      input.aggregateType,
      input.aggregateId,
      input.payload ?? {},
    ],
  );
}
