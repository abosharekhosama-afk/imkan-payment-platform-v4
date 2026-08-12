import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import {assertProductionPaymentMethodAllowed} from '../platform/sandbox-token-guard.js';

function normalizeEmail(email?: string | null): string | null {
  if (email == null || String(email).trim() === '') return null;
  return String(email).trim().toLowerCase();
}

export const customerService = {
  async create(
    organizationId: string,
    input: {
      name: string;
      email?: string | null;
      phone?: string | null;
      defaultPaymentMethodToken?: string | null;
      metadata?: Record<string, unknown>;
      externalCustomerId?: string | null;
      sourceSystem?: string | null;
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    const name = String(input.name || '').trim();
    if (!name) throw new AppError('CUSTOMER_NAME_REQUIRED', 'Customer name is required', 400);
    const email = normalizeEmail(input.email);
    assertProductionPaymentMethodAllowed(input.defaultPaymentMethodToken);

    return withPgTransaction(async (client) => {
      try {
        const r = await client.query(
          `INSERT INTO customers (
             organization_id, name, email, phone, default_payment_method_token, metadata_json,
             external_customer_id, source_system
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [
            organizationId,
            name,
            email,
            input.phone?.trim() || null,
            input.defaultPaymentMethodToken || null,
            JSON.stringify(input.metadata || {}),
            input.externalCustomerId || null,
            input.sourceSystem || null,
          ],
        );
        await writeAuditEvent(
          {
            organizationId,
            actorUserId: input.actorUserId,
            action: 'customer.created',
            resourceType: 'customer',
            resourceId: r.rows[0].id,
            requestId: input.requestId,
          },
          client,
        );
        await emitOutboxEvent(
          {
            organizationId,
            eventType: 'billing.customer.created',
            aggregateType: 'customer',
            aggregateId: r.rows[0].id,
            payload: {customer_id: r.rows[0].id, organization_id: organizationId, email},
            idempotencyKey: `customer-created-${r.rows[0].id}`,
          },
          client,
        );
        return r.rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new AppError('CUSTOMER_EMAIL_EXISTS', 'A customer with this email already exists in the organization', 409);
        }
        throw error;
      }
    });
  },

  async list(organizationId: string, limit = 50, offset = 0) {
    const r = await pgQuery(
      `SELECT * FROM customers WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset],
    );
    return r.rows;
  },

  async get(organizationId: string, customerId: string) {
    const r = await pgQuery(`SELECT * FROM customers WHERE id=$1 AND organization_id=$2`, [
      customerId,
      organizationId,
    ]);
    if (!r.rows[0]) throw notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
    return r.rows[0];
  },

  async update(
    organizationId: string,
    customerId: string,
    input: {
      name?: string;
      email?: string | null;
      phone?: string | null;
      externalCustomerId?: string | null;
      sourceSystem?: string | null;
      status?: 'ACTIVE' | 'DISABLED';
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    return withPgTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM customers WHERE id=$1 AND organization_id=$2 FOR UPDATE`, [
        customerId,
        organizationId,
      ]);
      if (!existing.rows[0]) throw notFound('Customer not found', 'CUSTOMER_NOT_FOUND');
      const row = existing.rows[0];
      const name = input.name !== undefined ? String(input.name).trim() : row.name;
      if (!name) throw new AppError('CUSTOMER_NAME_REQUIRED', 'Customer name is required', 400);
      const email = input.email !== undefined ? normalizeEmail(input.email) : row.email;
      const phone = input.phone !== undefined ? input.phone?.trim() || null : row.phone;
      const externalCustomerId =
        input.externalCustomerId !== undefined ? input.externalCustomerId : row.external_customer_id;
      const sourceSystem = input.sourceSystem !== undefined ? input.sourceSystem : row.source_system;
      const status = input.status !== undefined ? input.status : row.status;

      try {
        const r = await client.query(
          `UPDATE customers SET
             name=$3,
             email=$4,
             phone=$5,
             external_customer_id=$6,
             source_system=$7,
             status=$8,
             updated_at=NOW()
           WHERE id=$1 AND organization_id=$2
           RETURNING *`,
          [customerId, organizationId, name, email, phone, externalCustomerId, sourceSystem, status],
        );
        await writeAuditEvent(
          {
            organizationId,
            actorUserId: input.actorUserId,
            action: 'customer.updated',
            resourceType: 'customer',
            resourceId: customerId,
            requestId: input.requestId,
          },
          client,
        );
        return r.rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new AppError('CUSTOMER_EMAIL_EXISTS', 'A customer with this email already exists in the organization', 409);
        }
        throw error;
      }
    });
  },

  /** Payments correlated by customer email (Books sync + checkout customer_email). */
  async listPayments(organizationId: string, customerId: string, limit = 50, offset = 0) {
    const customer = await this.get(organizationId, customerId);
    if (!customer.email) return [];
    const r = await pgQuery(
      `SELECT id, amount_minor, currency_code, status, customer_name, customer_email, customer_phone,
              payment_link_id, reference, succeeded_at, failed_at, created_at
       FROM payment_intents
       WHERE organization_id=$1 AND lower(customer_email)=lower($2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [organizationId, customer.email, limit, offset],
    );
    return r.rows.map((row) => ({
      ...row,
      amount_minor: row.amount_minor != null ? String(row.amount_minor) : null,
    }));
  },
};
