import {config} from '../config.js';
import {pgQuery} from '../infrastructure/db/postgres.js';

/**
 * In local/dev, ensure every organization has a SANDBOX route to platform Stripe
 * so checkout shows card fields instead of tok_ok sandbox tokens.
 * Skipped in production and when STRIPE_AUTO_ROUTE=false.
 */
export async function bootstrapStripeRoutesDev(): Promise<void> {
  if (config.isProduction) return;
  if ((process.env.STRIPE_AUTO_ROUTE || 'true').toLowerCase() === 'false') return;

  const acc = await pgQuery(
    `SELECT pa.id
     FROM provider_accounts pa
     JOIN providers p ON p.id = pa.provider_id
     WHERE p.code = 'stripe' AND pa.organization_id IS NULL AND pa.environment = 'SANDBOX'
       AND pa.status = 'ACTIVE' AND p.status = 'ACTIVE'
     LIMIT 1`,
  );
  const stripeAccountId = acc.rows[0]?.id as string | undefined;
  if (!stripeAccountId) return;

  const orgs = await pgQuery(`SELECT id FROM organizations`);
  for (const row of orgs.rows) {
    const orgId = String(row.id);
    const existing = await pgQuery(
      `SELECT 1 FROM provider_routes WHERE organization_id = $1 AND environment = 'SANDBOX' AND is_active = TRUE LIMIT 1`,
      [orgId],
    );
    if (existing.rows[0]) continue;
    await pgQuery(
      `INSERT INTO provider_routes (organization_id, environment, provider_account_id, priority, is_active)
       VALUES ($1, 'SANDBOX', $2, 10, TRUE)`,
      [orgId, stripeAccountId],
    );
  }
}
