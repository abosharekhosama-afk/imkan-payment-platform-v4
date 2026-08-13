/**
 * Merchant finance statement from fee accruals (Zoho Payments-style).
 */
import {pgQuery} from '../infrastructure/db/postgres.js';
import {toCsv} from '../platform/csv-export.js';

export const financeStatementService = {
  async getStatement(
    organizationId: string,
    query: {environment?: string; currencyCode?: string; from?: string; to?: string} = {},
  ) {
    const environment = (query.environment || 'SANDBOX').toUpperCase();
    const params: unknown[] = [organizationId, environment];
    let currencyFilter = '';
    let fromFilter = '';
    let toFilter = '';
    if (query.currencyCode) {
      params.push(query.currencyCode.toUpperCase());
      currencyFilter = ` AND currency_code=$${params.length}`;
    }
    if (query.from) {
      params.push(query.from);
      fromFilter = ` AND created_at >= $${params.length}::timestamptz`;
    }
    if (query.to) {
      params.push(query.to);
      toFilter = ` AND created_at <= $${params.length}::timestamptz`;
    }

    const where = `organization_id=$1 AND environment=$2 AND status='SUCCEEDED'${currencyFilter}${fromFilter}${toFilter}`;

    const totals = await pgQuery(
      `SELECT
         COUNT(*)::int AS payment_count,
         COALESCE(SUM(amount_minor), 0)::text AS gross_minor,
         COALESCE(SUM(platform_fees_minor), 0)::text AS platform_fees_minor,
         COALESCE(SUM(provider_fees_minor), 0)::text AS provider_fees_minor,
         COALESCE(SUM(net_to_merchant_minor), 0)::text AS net_to_merchant_minor,
         MAX(currency_code) AS primary_currency
       FROM payment_intents
       WHERE ${where}`,
      params,
    );

    const byCurrency = await pgQuery(
      `SELECT currency_code,
              COUNT(*)::int AS payment_count,
              COALESCE(SUM(amount_minor), 0)::text AS gross_minor,
              COALESCE(SUM(platform_fees_minor), 0)::text AS platform_fees_minor,
              COALESCE(SUM(provider_fees_minor), 0)::text AS provider_fees_minor,
              COALESCE(SUM(net_to_merchant_minor), 0)::text AS net_to_merchant_minor
       FROM payment_intents
       WHERE ${where}
       GROUP BY currency_code
       ORDER BY currency_code`,
      params,
    );

    const lines = await pgQuery(
      `SELECT id, created_at, currency_code, status,
              amount_minor::text AS gross_minor,
              platform_fees_minor::text,
              provider_fees_minor::text,
              net_to_merchant_minor::text,
              fee_schedule_id, fees_accrued_at
       FROM payment_intents
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params,
    );

    const payouts = await pgQuery(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(amount_minor), 0)::text AS amount_minor
       FROM payouts
       WHERE organization_id=$1 AND environment=$2
       GROUP BY status`,
      [organizationId, environment],
    );

    const providerMix = await pgQuery(
      `SELECT COALESCE(pt.provider_code, 'unknown') AS provider_code,
              COUNT(*)::int AS payment_count,
              COALESCE(SUM(pi.amount_minor), 0)::text AS gross_minor,
              COALESCE(SUM(pi.net_to_merchant_minor), 0)::text AS net_to_merchant_minor
       FROM payment_intents pi
       LEFT JOIN LATERAL (
         SELECT provider_code
         FROM payment_transactions
         WHERE payment_intent_id = pi.id
         ORDER BY created_at DESC
         LIMIT 1
       ) pt ON TRUE
       WHERE pi.organization_id=$1 AND pi.environment=$2 AND pi.status='SUCCEEDED'${currencyFilter}${fromFilter}${toFilter}
       GROUP BY 1
       ORDER BY payment_count DESC`,
      params,
    );

    return {
      environment,
      currency_code: query.currencyCode?.toUpperCase() || totals.rows[0]?.primary_currency || null,
      period: {from: query.from || null, to: query.to || null},
      totals: totals.rows[0],
      by_currency: byCurrency.rows,
      payouts_by_status: payouts.rows,
      provider_mix: providerMix.rows,
      lines: lines.rows,
    };
  },

  async exportStatementCsv(
    organizationId: string,
    query: {environment?: string; currencyCode?: string; from?: string; to?: string} = {},
  ) {
    const statement = await this.getStatement(organizationId, query);
    return toCsv(statement.lines, [
      {key: 'id', header: 'payment_id'},
      {key: 'created_at', header: 'created_at'},
      {key: 'currency_code', header: 'currency'},
      {key: 'status', header: 'status'},
      {key: 'gross_minor', header: 'gross_minor'},
      {key: 'platform_fees_minor', header: 'platform_fees_minor'},
      {key: 'provider_fees_minor', header: 'provider_fees_minor'},
      {key: 'net_to_merchant_minor', header: 'net_to_merchant_minor'},
    ]);
  },

  async getPaymentFees(organizationId: string, paymentIntentId: string) {
    const r = await pgQuery(
      `SELECT id, currency_code, status, environment,
              amount_minor::text AS gross_minor,
              platform_fees_minor::text,
              provider_fees_minor::text,
              net_to_merchant_minor::text,
              fee_schedule_id, fees_accrued_at
       FROM payment_intents
       WHERE id=$1 AND organization_id=$2`,
      [paymentIntentId, organizationId],
    );
    return r.rows[0] || null;
  },
};
