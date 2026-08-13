import {pgQuery} from '../infrastructure/db/postgres.js';

/**
 * Read-only merchant dashboard aggregates over payment_intents.
 * Statuses (payment-state-machine): CREATED | REQUIRES_PAYMENT | PROCESSING |
 * SUCCEEDED | FAILED | CANCELLED | EXPIRED.
 */
export const dashboardSummaryService = {
  async getSummary(organizationId: string) {
    const [counts, currencies, recent, daily] = await Promise.all([
      pgQuery(
        `SELECT
           COUNT(*)::int AS total_count,
           COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded_count,
           COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed_count,
           COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_count,
           COUNT(*) FILTER (WHERE status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED'))::int AS pending_count,
           COUNT(*) FILTER (WHERE status = 'CREATED')::int AS created_count,
           COUNT(*) FILTER (WHERE status = 'REQUIRES_PAYMENT')::int AS requires_payment_count,
           COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing_count,
           COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS expired_count,
           COALESCE(SUM(amount_minor) FILTER (WHERE status = 'SUCCEEDED'), 0) AS succeeded_volume_minor
         FROM payment_intents
         WHERE organization_id = $1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT currency_code, COUNT(*)::int AS count
         FROM payment_intents
         WHERE organization_id = $1
         GROUP BY currency_code
         ORDER BY count DESC, currency_code ASC
         LIMIT 10`,
        [organizationId],
      ),
      pgQuery(
        `SELECT id, status, amount_minor, currency_code, created_at
         FROM payment_intents
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [organizationId],
      ),
      pgQuery(
        `SELECT
           DATE(created_at AT TIME ZONE 'UTC')::text AS day,
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded_count,
           COALESCE(SUM(amount_minor) FILTER (WHERE status = 'SUCCEEDED'), 0) AS volume_minor
         FROM payment_intents
         WHERE organization_id = $1
           AND created_at >= NOW() - INTERVAL '14 days'
         GROUP BY DATE(created_at AT TIME ZONE 'UTC')
         ORDER BY day ASC`,
        [organizationId],
      ),
    ]);

    const row = counts.rows[0] || {};
    const totalCount = Number(row.total_count || 0);
    const succeededCount = Number(row.succeeded_count || 0);
    const succeededVolume = String(row.succeeded_volume_minor ?? '0');
    const primaryCurrency = currencies.rows[0]?.currency_code
      ? String(currencies.rows[0].currency_code).trim()
      : 'SAR';
    const avgSucceeded =
      succeededCount > 0
        ? String(Math.round(Number(succeededVolume) / succeededCount))
        : '0';

    return {
      total_count: totalCount,
      succeeded_count: succeededCount,
      failed_count: Number(row.failed_count || 0),
      cancelled_count: Number(row.cancelled_count || 0),
      pending_count: Number(row.pending_count || 0),
      created_count: Number(row.created_count || 0),
      requires_payment_count: Number(row.requires_payment_count || 0),
      processing_count: Number(row.processing_count || 0),
      expired_count: Number(row.expired_count || 0),
      succeeded_volume_minor: succeededVolume,
      success_rate: totalCount ? succeededCount / totalCount : 0,
      avg_succeeded_minor: avgSucceeded,
      primary_currency: primaryCurrency,
      currency_breakdown: currencies.rows.map((c) => ({
        currency_code: String(c.currency_code).trim(),
        count: Number(c.count || 0),
      })),
      daily_series: daily.rows.map((d) => ({
        day: String(d.day),
        count: Number(d.count || 0),
        succeeded_count: Number(d.succeeded_count || 0),
        volume_minor: String(d.volume_minor ?? '0'),
      })),
      recent_payments: recent.rows.map((p) => ({
        id: p.id,
        status: p.status,
        amount_minor: p.amount_minor != null ? String(p.amount_minor) : null,
        currency_code: String(p.currency_code).trim(),
        created_at: p.created_at,
      })),
    };
  },
};
