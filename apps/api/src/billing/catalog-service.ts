import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import {assertActiveCurrency, parseMinorAmount} from '../payments/merchant-context.js';

function money(row: any) {
  if (!row) return row;
  return {...row, unit_amount_minor: row.unit_amount_minor != null ? String(row.unit_amount_minor) : null};
}

export const catalogService = {
  async createProduct(
    organizationId: string,
    input: {
      name: string;
      code?: string | null;
      description?: string | null;
      productType?: 'ONE_TIME' | 'SUBSCRIPTION';
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    const name = String(input.name || '').trim();
    if (!name) throw new AppError('PRODUCT_NAME_REQUIRED', 'Product name is required', 400);
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO products (organization_id, name, code, description, product_type)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          organizationId,
          name,
          input.code?.trim() || null,
          input.description?.trim() || null,
          input.productType || 'SUBSCRIPTION',
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: input.actorUserId,
          action: 'product.created',
          resourceType: 'product',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'billing.product.created',
          aggregateType: 'product',
          aggregateId: r.rows[0].id,
          payload: {product_id: r.rows[0].id},
          idempotencyKey: `product-created-${r.rows[0].id}`,
        },
        client,
      );
      return r.rows[0];
    });
  },

  async listProducts(organizationId: string) {
    const r = await pgQuery(
      `SELECT * FROM products WHERE organization_id=$1 ORDER BY created_at DESC`,
      [organizationId],
    );
    return r.rows;
  },

  async createPrice(
    organizationId: string,
    input: {
      productId: string;
      currencyCode: string;
      unitAmountMinor: string;
      intervalUnit?: string;
      intervalCount?: number;
      nickname?: string | null;
      actorUserId?: string | null;
      requestId?: string;
    },
  ) {
    const amount = parseMinorAmount(input.unitAmountMinor);
    const currency = input.currencyCode.toUpperCase();
    const intervalUnit = (input.intervalUnit || 'MONTH').toUpperCase();
    if (!['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(intervalUnit)) {
      throw new AppError('INTERVAL_UNIT_UNSUPPORTED', 'Unsupported interval unit', 400);
    }
    return withPgTransaction(async (client) => {
      await assertActiveCurrency(client, currency);
      const product = await client.query(
        `SELECT id FROM products WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'`,
        [input.productId, organizationId],
      );
      if (!product.rows[0]) throw notFound('Product not found', 'PRODUCT_NOT_FOUND');
      const r = await client.query(
        `INSERT INTO prices (
           organization_id, product_id, currency_code, unit_amount_minor,
           interval_unit, interval_count, nickname
         ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          organizationId,
          input.productId,
          currency,
          amount,
          intervalUnit,
          Math.max(1, Number(input.intervalCount || 1)),
          input.nickname || null,
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: input.actorUserId,
          action: 'price.created',
          resourceType: 'price',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'billing.price.created',
          aggregateType: 'price',
          aggregateId: r.rows[0].id,
          payload: {
            price_id: r.rows[0].id,
            product_id: input.productId,
            unit_amount_minor: amount,
            currency_code: currency,
          },
          idempotencyKey: `price-created-${r.rows[0].id}`,
        },
        client,
      );
      return money(r.rows[0]);
    });
  },

  async listPrices(organizationId: string, productId?: string) {
    const params: unknown[] = [organizationId];
    let sql = `SELECT * FROM prices WHERE organization_id=$1`;
    if (productId) {
      params.push(productId);
      sql += ` AND product_id=$2`;
    }
    sql += ` ORDER BY created_at DESC`;
    const r = await pgQuery(sql, params);
    return r.rows.map(money);
  },
};
