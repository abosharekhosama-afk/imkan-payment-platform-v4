import type {PgClient} from '../infrastructure/db/postgres.js';
import {AppError} from '../foundation/errors.js';

/**
 * Ensures Organization → Merchant Profile exists for payment operations.
 * Creates a minimal merchant_profiles row when missing (trading name from org).
 */
export async function ensureMerchantProfile(client: PgClient, organizationId: string): Promise<{
  id: string;
  organization_id: string;
}> {
  const existing = await client.query(
    `SELECT id, organization_id FROM merchant_profiles WHERE organization_id=$1 FOR UPDATE`,
    [organizationId],
  );
  if (existing.rows[0]) return existing.rows[0];

  const org = await client.query<{name: string}>(`SELECT name FROM organizations WHERE id=$1`, [organizationId]);
  if (!org.rows[0]) throw new AppError('ORG_NOT_FOUND', 'Organization not found', 404);

  const created = await client.query(
    `INSERT INTO merchant_profiles (organization_id, trading_name)
     VALUES ($1,$2)
     ON CONFLICT (organization_id) DO UPDATE SET updated_at=NOW()
     RETURNING id, organization_id`,
    [organizationId, org.rows[0].name],
  );
  return created.rows[0];
}

export async function assertActiveCurrency(client: PgClient, currencyCode: string): Promise<void> {
  const r = await client.query(
    `SELECT code, is_active FROM master_currencies WHERE code=$1`,
    [currencyCode.toUpperCase()],
  );
  if (!r.rows[0]) throw new AppError('MASTER_CODE_INVALID', `Unknown currency: ${currencyCode}`, 400);
  if (!r.rows[0].is_active) throw new AppError('MASTER_CODE_INACTIVE', `Currency is inactive: ${currencyCode}`, 400);
}

export function parseMinorAmount(raw: string | number | bigint): string {
  const s = String(raw).trim();
  if (!/^\d{1,30}$/.test(s) || s === '0') {
    throw new AppError('INVALID_AMOUNT', 'amount_minor must be a positive integer string of at most 30 digits', 400);
  }
  return s;
}
