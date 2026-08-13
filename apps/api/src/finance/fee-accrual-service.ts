/**
 * P17.1 — Per-payment fee accrual at capture (Zoho Payments model).
 */
import type {PgClient} from '../infrastructure/db/postgres.js';
import {AppError} from '../foundation/errors.js';
import {computePaymentFeeAccrual} from './financial-model.js';
import {feeScheduleService} from './fee-schedules-service.js';
import {ledgerService} from '../ledger/ledger-service.js';

export type AccruePaymentFeesInput = {
  organizationId: string;
  paymentIntentId: string;
  amountMinor: string;
  currencyCode: string;
  environment: string;
  providerFeesMinor?: string | null;
};

export const feeAccrualService = {
  async accrueOnPaymentSuccess(client: PgClient, input: AccruePaymentFeesInput) {
    const gross = BigInt(String(input.amountMinor));
    const environment = (input.environment || 'SANDBOX').toUpperCase();
    const currency = input.currencyCode.toUpperCase();
    const providerFees = BigInt(String(input.providerFeesMinor || '0'));

    const locked = await client.query(
      `SELECT id, status, fees_accrued_at, amount_minor::text AS amount_minor
       FROM payment_intents
       WHERE id=$1 AND organization_id=$2
       FOR UPDATE`,
      [input.paymentIntentId, input.organizationId],
    );
    if (!locked.rows[0]) {
      throw new AppError('PAYMENT_NOT_FOUND', 'Payment intent not found', 404);
    }
    if (locked.rows[0].fees_accrued_at) {
      const existing = await client.query(
        `SELECT amount_minor::text AS gross_minor, provider_fees_minor::text, platform_fees_minor::text,
                net_to_merchant_minor::text, fee_schedule_id
         FROM payment_intents WHERE id=$1`,
        [input.paymentIntentId],
      );
      return {idempotent: true, accrual: existing.rows[0]};
    }

    const schedule = await feeScheduleService.resolveActivePlatformFee(
      client,
      input.organizationId,
      environment,
      currency,
    );
    const accrual = computePaymentFeeAccrual({
      grossMinor: gross,
      basisPoints: schedule.basisPoints,
      fixedMinor: schedule.fixedMinor,
      providerFeesMinor: providerFees,
      feeScheduleId: schedule.scheduleId,
    });

    await client.query(
      `UPDATE payment_intents SET
         environment=$3,
         provider_fees_minor=$4,
         platform_fees_minor=$5,
         net_to_merchant_minor=$6,
         fee_schedule_id=$7,
         fees_accrued_at=NOW(),
         updated_at=NOW()
       WHERE id=$1 AND organization_id=$2`,
      [
        input.paymentIntentId,
        input.organizationId,
        environment,
        accrual.provider_fees_minor,
        accrual.platform_fees_minor,
        accrual.net_to_merchant_minor,
        accrual.fee_schedule_id,
      ],
    );

    await ledgerService.postPaymentSucceededWithClient(client, {
      organizationId: input.organizationId,
      paymentIntentId: input.paymentIntentId,
      amountMinor: accrual.gross_minor,
      currencyCode: currency,
      environment,
      platformFeesMinor: accrual.platform_fees_minor,
      providerFeesMinor: accrual.provider_fees_minor,
      netToMerchantMinor: accrual.net_to_merchant_minor,
    });

    return {idempotent: false, accrual};
  },
};
