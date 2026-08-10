import type {FastifyReply, FastifyRequest} from 'fastify';
import {createHash} from 'node:crypto';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError} from './errors.js';

function requestHash(request: FastifyRequest): string {
  const payload = JSON.stringify({
    method: request.method,
    url: request.url.split('?')[0],
    body: request.body ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Idempotency-Key middleware for mutating /api/v1 operations.
 * Requires header Idempotency-Key. Keys are scoped by organization_id when present,
 * otherwise by null org scope (auth-level operations).
 */
export function idempotencyPreHandler(operation: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const key = String(request.headers['idempotency-key'] || '').trim();
    if (!key) {
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for this operation.', 400);
    }
    if (key.length < 8 || key.length > 200) {
      throw new AppError('IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key length must be between 8 and 200.', 400);
    }

    const organizationId = request.auth?.organizationId || null;
    const hash = requestHash(request);
    const existing = await pgQuery<{
      status: string;
      request_hash: string | null;
      response_json: unknown;
    }>(
      `SELECT status, request_hash, response_json FROM idempotency_keys
       WHERE organization_id IS NOT DISTINCT FROM $1 AND idem_key=$2`,
      [organizationId, key],
    );
    const row = existing.rows[0];
    if (row) {
      if (row.request_hash && row.request_hash !== hash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSE', 'Idempotency-Key was reused with a different payload.', 409);
      }
      if (row.status === 'COMPLETED' && row.response_json) {
        const cached = row.response_json as {statusCode?: number; body?: unknown};
        return reply.code(cached.statusCode || 200).send(cached.body);
      }
      if (row.status === 'STARTED') {
        throw new AppError('IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is still in progress.', 409);
      }
    } else {
      await pgQuery(
        `INSERT INTO idempotency_keys(organization_id, idem_key, operation, request_hash, status)
         VALUES ($1,$2,$3,$4,'STARTED')`,
        [organizationId, key, operation, hash],
      );
    }

    (request as any).idempotency = {key, organizationId, operation, hash};
  };
}

export async function completeIdempotency(request: FastifyRequest, statusCode: number, body: unknown) {
  const meta = (request as any).idempotency as
    | {key: string; organizationId: string | null; operation: string; hash: string}
    | undefined;
  if (!meta) return;
  await withPgTransaction(async (client) => {
    await client.query(
      `UPDATE idempotency_keys
       SET status='COMPLETED', response_json=$3, request_hash=$4
       WHERE organization_id IS NOT DISTINCT FROM $1 AND idem_key=$2`,
      [meta.organizationId, meta.key, {statusCode, body}, meta.hash],
    );
  });
}

export async function failIdempotency(request: FastifyRequest) {
  const meta = (request as any).idempotency as {key: string; organizationId: string | null} | undefined;
  if (!meta) return;
  await pgQuery(
    `UPDATE idempotency_keys SET status='FAILED'
     WHERE organization_id IS NOT DISTINCT FROM $1 AND idem_key=$2 AND status='STARTED'`,
    [meta.organizationId, meta.key],
  );
}
