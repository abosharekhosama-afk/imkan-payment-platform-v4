import crypto from 'node:crypto';
import { pool } from '../../infrastructure/db/mysql.js';
import { createSubscriptionDraft, normalizePriceInput, parseProductInput, type ProductType } from '../../domain/billing/index.js';

export class BillingService {
  async createProduct(
    t: string,
    m: string,
    input: {
      name: string;
      description?: string;
      sku?: string;
      type?: ProductType;
      active?: boolean;
      metadata?: Record<string, unknown>;
    }
  ) {
    const product = parseProductInput(input);
    const id = crypto.randomUUID();

    await pool.query(
      'INSERT INTO products(id,tenant_id,merchant_id,name,description,sku,type,active,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)',
      [id, t, m, product.name, product.description, product.sku, product.type, product.active, JSON.stringify(product.metadata)]
    );

    return {
      id,
      name: product.name,
      description: product.description,
      status: product.status,
      sku: product.sku,
      type: product.type,
      active: product.active,
      metadata: product.metadata,
    };
  }

  async createPrice(
    t: string,
    productId: string,
    input: {
      currency: string;
      unit_amount_minor: number | string;
      interval_unit?: string;
      interval_count?: number;
      tax_behavior?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    const price = normalizePriceInput({
      currency: input.currency,
      unitAmountMinor: input.unit_amount_minor,
      intervalUnit: input.interval_unit,
      intervalCount: input.interval_count,
      taxBehavior: input.tax_behavior as any,
      metadata: input.metadata,
    });

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO prices(id,tenant_id,product_id,currency,unit_amount_minor,interval_unit,interval_count,status,tax_behavior,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id, t, productId, price.currency, price.unit_amount_minor, price.interval_unit, price.interval_count, 'ACTIVE', price.tax_behavior, JSON.stringify(price.metadata)]
    );

    return {
      id,
      product_id: productId,
      currency: price.currency,
      unit_amount_minor: price.unit_amount_minor,
      interval_unit: price.interval_unit,
      interval_count: price.interval_count,
      status: 'ACTIVE',
      tax_behavior: price.tax_behavior,
      metadata: price.metadata,
    };
  }

  async createSubscription(
    t: string,
    m: string,
    c: string,
    priceId: string,
    input?: {
      trial_days?: number;
      current_period_start?: Date;
      current_period_end?: Date;
      next_billing_at?: Date;
      status?: string;
      cancel_at_period_end?: boolean;
    }
  ) {
    const [p]: any = await pool.query('SELECT * FROM prices WHERE id=? AND tenant_id=? AND status=\'ACTIVE\'', [priceId, t]);
    if (!p[0]) throw Object.assign(new Error('PRICE_NOT_FOUND'), { code: 'PRICE_NOT_FOUND', statusCode: 404 });

    const start = input?.current_period_start || new Date();
    const end = input?.current_period_end || new Date(start.getTime());
    end.setMonth(end.getMonth() + 1);

    const draft = createSubscriptionDraft({
      customerId: c,
      merchantId: m,
      priceId,
      status: (input?.status as any) || 'ACTIVE',
      trialDays: input?.trial_days || 0,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      nextBillingAt: input?.next_billing_at || end,
      cancelAtPeriodEnd: input?.cancel_at_period_end || false,
    });

    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO subscriptions(id,tenant_id,merchant_id,customer_id,price_id,status,current_period_start,current_period_end,cancel_at_period_end,next_billing_at,trial_days) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      [id, t, m, c, priceId, draft.status, draft.current_period_start, draft.current_period_end, draft.cancel_at_period_end, draft.next_billing_at, draft.trial_days]
    );

    return {
      id,
      status: draft.status,
      current_period_start: draft.current_period_start,
      current_period_end: draft.current_period_end,
      next_billing_at: draft.next_billing_at,
      trial_days: draft.trial_days,
      cancel_at_period_end: draft.cancel_at_period_end,
    };
  }
}

