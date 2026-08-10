import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';

export const riskService = {
  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM risk_signals WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async create(input: {
    organizationId: string;
    paymentIntentId?: string | null;
    signalType: string;
    score?: number | null;
    decision?: 'ALLOW' | 'BLOCK' | 'REVIEW';
    details?: Record<string, unknown>;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO risk_signals(
           organization_id, payment_intent_id, signal_type, score, decision, details_json
         ) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          input.organizationId,
          input.paymentIntentId || null,
          input.signalType,
          input.score ?? null,
          input.decision || 'ALLOW',
          JSON.stringify(input.details || {}),
        ],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'risk.signal.created',
          resourceType: 'risk_signal',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      return r.rows[0];
    });
  },
};

export const disputesService = {
  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM disputes WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async create(input: {
    organizationId: string;
    paymentIntentId?: string | null;
    amountMinor: string;
    currency: string;
    reason?: string | null;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO disputes(
           organization_id, payment_intent_id, amount_minor, currency_code, status, reason
         ) VALUES ($1,$2,$3,$4,'OPEN',$5) RETURNING *`,
        [
          input.organizationId,
          input.paymentIntentId || null,
          input.amountMinor,
          input.currency.toUpperCase(),
          input.reason || null,
        ],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'dispute.created',
          resourceType: 'dispute',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      return r.rows[0];
    });
  },

  async get(organizationId: string, id: string) {
    const r = await pgQuery(`SELECT * FROM disputes WHERE organization_id=$1 AND id=$2`, [
      organizationId,
      id,
    ]);
    if (!r.rows[0]) throw notFound('Dispute not found');
    return r.rows[0];
  },
};
