/**
 * P15.1-A — Org fee schedules (DEC-008.2).
 * Deterministic selection: active + currency + environment + fee_type + effective window.
 */
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, notFound, forbidden} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {computePlatformFeeMinor} from './financial-model.js';

export type FeeScheduleRow = {
  id: string;
  organization_id: string;
  environment: string;
  currency_code: string;
  fee_type_code: string;
  name: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  basis_points: number;
  fixed_minor: string;
};

type Actor = {userId?: string | null; requestId?: string};

function project(row: any, line?: any): FeeScheduleRow {
  return {
    id: row.id,
    organization_id: row.organization_id,
    environment: row.environment,
    currency_code: row.currency_code,
    fee_type_code: row.fee_type_code,
    name: row.name,
    is_active: row.is_active,
    effective_from: row.effective_from,
    effective_to: row.effective_to,
    basis_points: Number(line?.basis_points ?? row.basis_points ?? 0),
    fixed_minor: String(line?.fixed_minor ?? row.fixed_minor ?? '0'),
  };
}

export const feeScheduleService = {
  async list(organizationId: string) {
    const r = await pgQuery(
      `SELECT s.*, l.basis_points, l.fixed_minor
       FROM fee_schedules s
       LEFT JOIN fee_schedule_lines l ON l.fee_schedule_id = s.id
       WHERE s.organization_id=$1
       ORDER BY s.currency_code, s.environment, s.effective_from DESC`,
      [organizationId],
    );
    return r.rows.map((row) => project(row));
  },

  async get(organizationId: string, scheduleId: string) {
    const r = await pgQuery(
      `SELECT s.*, l.basis_points, l.fixed_minor
       FROM fee_schedules s
       LEFT JOIN fee_schedule_lines l ON l.fee_schedule_id = s.id
       WHERE s.id=$1 AND s.organization_id=$2`,
      [scheduleId, organizationId],
    );
    if (!r.rows[0]) throw notFound('Fee schedule not found', 'FEE_SCHEDULE_NOT_FOUND');
    return project(r.rows[0]);
  },

  /**
   * Resolve active platform PROCESSING schedule for org/env/currency at asOf.
   * Returns null → platform fee = 0 (explicit default, not hard-coded forever).
   */
  async resolveActivePlatformFee(
    client: PgClient,
    organizationId: string,
    environment: string,
    currencyCode: string,
    asOf = new Date(),
  ): Promise<{scheduleId: string | null; basisPoints: number; fixedMinor: bigint}> {
    const currency = currencyCode.toUpperCase();
    const r = await client.query(
      `SELECT s.id, l.basis_points, l.fixed_minor
       FROM fee_schedules s
       JOIN fee_schedule_lines l ON l.fee_schedule_id = s.id
       WHERE s.organization_id=$1
         AND s.environment=$2
         AND s.currency_code=$3
         AND s.fee_type_code='PROCESSING'
         AND s.is_active = TRUE
         AND s.effective_from <= $4
         AND (s.effective_to IS NULL OR s.effective_to > $4)
       ORDER BY s.effective_from DESC
       LIMIT 1`,
      [organizationId, environment, currency, asOf.toISOString()],
    );
    if (!r.rows[0]) return {scheduleId: null, basisPoints: 0, fixedMinor: 0n};
    return {
      scheduleId: r.rows[0].id as string,
      basisPoints: Number(r.rows[0].basis_points || 0),
      fixedMinor: BigInt(String(r.rows[0].fixed_minor || '0')),
    };
  },

  async upsert(
    organizationId: string,
    input: {
      environment?: string;
      currencyCode: string;
      feeTypeCode?: string;
      name: string;
      basisPoints: number;
      fixedMinor: string;
      isActive?: boolean;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    },
    actor: Actor,
  ) {
    const environment = (input.environment || 'SANDBOX').toUpperCase();
    if (environment !== 'SANDBOX' && environment !== 'LIVE') {
      throw new AppError('INVALID_ENVIRONMENT', 'environment must be SANDBOX or LIVE', 400);
    }
    const currency = input.currencyCode.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new AppError('INVALID_CURRENCY', 'currency_code must be CHAR(3)', 400);
    }
    const feeType = (input.feeTypeCode || 'PROCESSING').toUpperCase();
    const bps = Number(input.basisPoints);
    if (!Number.isInteger(bps) || bps < 0 || bps > 100_000) {
      throw new AppError('INVALID_FEE_BPS', 'basis_points must be 0..100000', 400);
    }
    if (!/^\d{1,30}$/.test(String(input.fixedMinor))) {
      throw new AppError('INVALID_FEE_FIXED', 'fixed_minor must be a non-negative integer string', 400);
    }

    return withPgTransaction(async (client) => {
      // Deactivate prior active schedules for same key when activating a new one
      if (input.isActive !== false) {
        await client.query(
          `UPDATE fee_schedules
           SET is_active=FALSE, updated_at=NOW()
           WHERE organization_id=$1 AND environment=$2 AND currency_code=$3
             AND fee_type_code=$4 AND is_active=TRUE`,
          [organizationId, environment, currency, feeType],
        );
      }
      const s = await client.query(
        `INSERT INTO fee_schedules(
           organization_id, environment, currency_code, fee_type_code, name, is_active,
           effective_from, effective_to
         ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()),$8)
         RETURNING *`,
        [
          organizationId,
          environment,
          currency,
          feeType,
          input.name,
          input.isActive !== false,
          input.effectiveFrom || null,
          input.effectiveTo || null,
        ],
      );
      await client.query(
        `INSERT INTO fee_schedule_lines(fee_schedule_id, organization_id, basis_points, fixed_minor)
         VALUES ($1,$2,$3,$4)`,
        [s.rows[0].id, organizationId, bps, input.fixedMinor],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId || null,
          action: 'fee_schedule.upsert',
          resourceType: 'fee_schedules',
          resourceId: s.rows[0].id,
          requestId: actor.requestId,
          after: {currency, environment, feeType, basis_points: bps, fixed_minor: input.fixedMinor},
        },
        client,
      );
      return project(s.rows[0], {basis_points: bps, fixed_minor: input.fixedMinor});
    });
  },

  /** Preview fee for a gross amount using resolved schedule (or zeros). */
  async previewPlatformFee(
    organizationId: string,
    input: {environment?: string; currencyCode: string; grossMinor: string},
  ) {
    return withPgTransaction(async (client) => {
      const env = (input.environment || 'SANDBOX').toUpperCase();
      const resolved = await feeScheduleService.resolveActivePlatformFee(
        client,
        organizationId,
        env,
        input.currencyCode,
      );
      const fee = computePlatformFeeMinor({
        grossMinor: BigInt(input.grossMinor),
        basisPoints: resolved.basisPoints,
        fixedMinor: resolved.fixedMinor,
      });
      return {
        currency_code: input.currencyCode.toUpperCase(),
        environment: env,
        fee_schedule_id: resolved.scheduleId,
        basis_points: resolved.basisPoints,
        fixed_minor: resolved.fixedMinor.toString(),
        gross_minor: input.grossMinor,
        platform_fees_minor: fee.toString(),
        rounding: 'HALF_UP',
      };
    });
  },
};

export function assertOrgOwnsSchedule(scheduleOrgId: string, organizationId: string) {
  if (scheduleOrgId !== organizationId) {
    throw forbidden('Cross-tenant fee schedule access denied', 'CROSS_TENANT_DENIED');
  }
}
