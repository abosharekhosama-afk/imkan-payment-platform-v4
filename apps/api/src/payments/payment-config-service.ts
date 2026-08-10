import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {ensureMerchantProfile} from './merchant-context.js';

type Actor = {userId: string; requestId?: string};

export const paymentConfigService = {
  async get(organizationId: string) {
    return withPgTransaction(async (client) => {
      const profile = await ensureMerchantProfile(client, organizationId);
      const r = await client.query(
        `SELECT * FROM merchant_payment_config WHERE organization_id=$1`,
        [organizationId],
      );
      if (r.rows[0]) return r.rows[0];
      const created = await client.query(
        `INSERT INTO merchant_payment_config (organization_id, merchant_profile_id, company_display_name)
         SELECT $1, $2, COALESCE(mp.trading_name, o.name)
         FROM organizations o
         JOIN merchant_profiles mp ON mp.organization_id = o.id
         WHERE o.id=$1
         RETURNING *`,
        [organizationId, profile.id],
      );
      return created.rows[0];
    });
  },

  async upsert(
    organizationId: string,
    input: {
      companyDisplayName?: string | null;
      logoUrl?: string | null;
      brandPrimaryColor?: string | null;
      brandSecondaryColor?: string | null;
      description?: string | null;
      supportEmail?: string | null;
      supportPhone?: string | null;
      checkoutTheme?: Record<string, unknown>;
      defaultSuccessUrl?: string | null;
      defaultCancelUrl?: string | null;
      metadata?: Record<string, unknown>;
    },
    actor: Actor,
  ) {
    return withPgTransaction(async (client) => {
      const profile = await ensureMerchantProfile(client, organizationId);
      const before = await client.query(`SELECT * FROM merchant_payment_config WHERE organization_id=$1 FOR UPDATE`, [
        organizationId,
      ]);
      const r = await client.query(
        `INSERT INTO merchant_payment_config (
           organization_id, merchant_profile_id, company_display_name, logo_url,
           brand_primary_color, brand_secondary_color, description, support_email, support_phone,
           checkout_theme_json, default_success_url, default_cancel_url, metadata_json
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,
           COALESCE($10::jsonb, '{}'::jsonb),
           $11,$12,
           COALESCE($13::jsonb, '{}'::jsonb)
         )
         ON CONFLICT (organization_id) DO UPDATE SET
           company_display_name=COALESCE($3, merchant_payment_config.company_display_name),
           logo_url=COALESCE($4, merchant_payment_config.logo_url),
           brand_primary_color=COALESCE($5, merchant_payment_config.brand_primary_color),
           brand_secondary_color=COALESCE($6, merchant_payment_config.brand_secondary_color),
           description=COALESCE($7, merchant_payment_config.description),
           support_email=COALESCE($8, merchant_payment_config.support_email),
           support_phone=COALESCE($9, merchant_payment_config.support_phone),
           checkout_theme_json=COALESCE($10::jsonb, merchant_payment_config.checkout_theme_json),
           default_success_url=COALESCE($11, merchant_payment_config.default_success_url),
           default_cancel_url=COALESCE($12, merchant_payment_config.default_cancel_url),
           metadata_json=COALESCE($13::jsonb, merchant_payment_config.metadata_json),
           updated_at=NOW()
         RETURNING *`,
        [
          organizationId,
          profile.id,
          input.companyDisplayName ?? null,
          input.logoUrl ?? null,
          input.brandPrimaryColor ?? null,
          input.brandSecondaryColor ?? null,
          input.description ?? null,
          input.supportEmail ?? null,
          input.supportPhone ?? null,
          input.checkoutTheme ? JSON.stringify(input.checkoutTheme) : null,
          input.defaultSuccessUrl ?? null,
          input.defaultCancelUrl ?? null,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'payment_config.upsert',
          resourceType: 'merchant_payment_config',
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          before: before.rows[0] || null,
          after: r.rows[0],
        },
        client,
      );
      return r.rows[0];
    });
  },

  /** Public branding projection for checkout (no internal metadata). */
  async getPublicBranding(organizationId: string) {
    const r = await pgQuery(
      `SELECT company_display_name, logo_url, brand_primary_color, brand_secondary_color,
              description, support_email, support_phone, checkout_theme_json
       FROM merchant_payment_config WHERE organization_id=$1`,
      [organizationId],
    );
    return r.rows[0] || null;
  },
};
