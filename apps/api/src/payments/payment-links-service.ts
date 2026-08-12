import {randomToken} from '../foundation/crypto.js';
import {AppError, conflict, notFound} from '../foundation/errors.js';
import {emitOutboxEvent, writeAuditEvent} from '../foundation/audit.js';
import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {assertActiveCurrency, ensureMerchantProfile, parseMinorAmount} from './merchant-context.js';
import {assertSafePublicUrl} from '../security/url-safety.js';
import {assertMerchantPaymentsAllowed} from '../security/onboarding-gate.js';
import {config} from '../config.js';

type Actor = {userId: string; requestId?: string};

export type PaymentLinkStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELLED';

const LINK_TRANSITIONS: Record<PaymentLinkStatus, PaymentLinkStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['INACTIVE', 'EXPIRED', 'CANCELLED'],
  INACTIVE: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  EXPIRED: [],
  CANCELLED: [],
};

function publicCheckoutUrl(token: string): string {
  const base = (config as any).checkoutBaseUrl || process.env.CHECKOUT_BASE_URL || process.env.API_BASE_URL || '';
  const trimmed = String(base || '').replace(/\/$/, '');
  // Public API path under /api/v1; UI may wrap this later.
  return trimmed ? `${trimmed}/api/v1/checkout/${token}` : `/api/v1/checkout/${token}`;
}

function projectLink(row: any) {
  return {
    ...row,
    amount_minor: row.amount_minor != null ? String(row.amount_minor) : null,
    public_url: publicCheckoutUrl(row.public_token),
  };
}

async function lockLink(client: PgClient, organizationId: string, linkId: string) {
  const r = await client.query(
    `SELECT * FROM payment_links WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [linkId, organizationId],
  );
  if (!r.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
  return r.rows[0] as any;
}

async function maybeExpireLink(client: PgClient, link: any) {
  if (link.status === 'ACTIVE' && link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) {
    const r = await client.query(
      `UPDATE payment_links
       SET status='EXPIRED', version=version+1, updated_at=NOW()
       WHERE id=$1 AND status='ACTIVE' AND version=$2
       RETURNING *`,
      [link.id, link.version],
    );
    if (r.rows[0]) return r.rows[0];
  }
  return link;
}

function assertLinkTransition(from: PaymentLinkStatus, to: PaymentLinkStatus) {
  if (!LINK_TRANSITIONS[from].includes(to)) {
    throw conflict(`Invalid payment link transition ${from} → ${to}`, 'PAYMENT_LINK_INVALID_TRANSITION');
  }
}

export const paymentLinksService = {
  async create(
    organizationId: string,
    input: {
      title: string;
      description?: string;
      amountMode: 'FIXED' | 'CUSTOMER_ENTERED';
      amountMinor?: string;
      currencyCode: string;
      reference?: string;
      expiresAt?: string | null;
      maxUses?: number | null;
      oneTime?: boolean;
      reusable?: boolean;
      metadata?: Record<string, unknown>;
      activate?: boolean;
      externalInvoiceRef?: string | null;
      successUrl?: string | null;
      cancelUrl?: string | null;
    },
    actor: Actor,
  ) {
    const currency = input.currencyCode.toUpperCase();
    const oneTime = input.oneTime ?? true;
    const reusable = oneTime ? false : (input.reusable ?? false);
    let maxUses = input.maxUses ?? (oneTime ? 1 : null);
    if (oneTime) maxUses = 1;

    let amountMinor: string | null = null;
    if (input.amountMode === 'FIXED') {
      if (input.amountMinor == null) {
        throw new AppError('AMOUNT_REQUIRED', 'amount_minor is required for FIXED amount links', 400);
      }
      amountMinor = parseMinorAmount(input.amountMinor);
    } else if (input.amountMinor != null) {
      amountMinor = parseMinorAmount(input.amountMinor);
    }

    const successUrl = assertSafePublicUrl(input.successUrl, 'success_url');
    const cancelUrl = assertSafePublicUrl(input.cancelUrl, 'cancel_url');
    await assertMerchantPaymentsAllowed(organizationId);

    return withPgTransaction(async (client) => {
      const profile = await ensureMerchantProfile(client, organizationId);
      await assertActiveCurrency(client, currency);
      const token = randomToken(24);
      const status: PaymentLinkStatus = input.activate === false ? 'DRAFT' : 'ACTIVE';
      const r = await client.query(
        `INSERT INTO payment_links (
           organization_id, merchant_profile_id, public_token, title, description,
           amount_mode, amount_minor, currency_code, reference, status, expires_at,
           max_uses, one_time, reusable, metadata_json, created_by_user_id, activated_at,
           external_invoice_ref, success_url, cancel_url
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING *`,
        [
          organizationId,
          profile.id,
          token,
          input.title,
          input.description || null,
          input.amountMode,
          amountMinor,
          currency,
          input.reference || null,
          status,
          input.expiresAt || null,
          maxUses,
          oneTime,
          reusable,
          JSON.stringify(input.metadata || {}),
          actor.userId,
          status === 'ACTIVE' ? new Date().toISOString() : null,
          input.externalInvoiceRef || null,
          successUrl,
          cancelUrl,
        ],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'payment_link.create',
          resourceType: 'payment_links',
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          after: {id: r.rows[0].id, status, amount_mode: input.amountMode, currency},
        },
        client,
      );
      await emitOutboxEvent(
        {
          organizationId,
          eventType: 'payment_link.created',
          aggregateType: 'payment_link',
          aggregateId: r.rows[0].id,
          payload: {
            payment_link_id: r.rows[0].id,
            organization_id: organizationId,
            status,
            amount_mode: input.amountMode,
            amount_minor: amountMinor,
            currency_code: currency,
            reference: input.reference || null,
          },
          idempotencyKey: `payment-link-create-${r.rows[0].id}`,
        },
        client,
      );
      return projectLink(r.rows[0]);
    });
  },

  async list(organizationId: string, filter: {status?: string; limit: number; offset: number}) {
    const params: unknown[] = [organizationId];
    let where = 'WHERE organization_id=$1';
    if (filter.status) {
      params.push(filter.status);
      where += ` AND status=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT * FROM payment_links ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows.map(projectLink);
  },

  async get(organizationId: string, linkId: string) {
    const r = await pgQuery(`SELECT * FROM payment_links WHERE id=$1 AND organization_id=$2`, [
      linkId,
      organizationId,
    ]);
    if (!r.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
    return projectLink(r.rows[0]);
  },

  /** Resolve by public token for checkout (no org in path). Applies expiry. */
  async getByPublicToken(token: string) {
    return withPgTransaction(async (client) => {
      const r = await client.query(`SELECT * FROM payment_links WHERE public_token=$1 FOR UPDATE`, [token]);
      if (!r.rows[0]) throw notFound('Payment link not found', 'PAYMENT_LINK_NOT_FOUND');
      const link = await maybeExpireLink(client, r.rows[0]);
      return link;
    });
  },

  async update(
    organizationId: string,
    linkId: string,
    patch: {
      title?: string;
      description?: string | null;
      amountMinor?: string | null;
      reference?: string | null;
      expiresAt?: string | null;
      maxUses?: number | null;
      metadata?: Record<string, unknown>;
    },
    actor: Actor,
  ) {
    return withPgTransaction(async (client) => {
      let link = await lockLink(client, organizationId, linkId);
      link = await maybeExpireLink(client, link);
      if (['CANCELLED', 'EXPIRED'].includes(link.status)) {
        throw conflict(`Cannot update payment link in status ${link.status}`, 'PAYMENT_LINK_NOT_EDITABLE');
      }
      // Active links: only non-financial metadata/description/expiry/max_uses may change; amount locked once used.
      if (link.use_count > 0 && patch.amountMinor !== undefined) {
        throw conflict('Cannot change amount after the link has been used', 'PAYMENT_LINK_AMOUNT_LOCKED');
      }
      if (link.amount_mode === 'FIXED' && patch.amountMinor !== undefined && patch.amountMinor != null) {
        parseMinorAmount(patch.amountMinor);
      }

      const r = await client.query(
        `UPDATE payment_links SET
           title=COALESCE($3, title),
           description=COALESCE($4, description),
           amount_minor=CASE WHEN $5::text IS NULL THEN amount_minor ELSE $5::numeric END,
           reference=COALESCE($6, reference),
           expires_at=CASE WHEN $7::text = '__CLEAR__' THEN NULL WHEN $7::text IS NULL THEN expires_at ELSE $7::timestamptz END,
           max_uses=CASE WHEN $8::text = '__CLEAR__' THEN NULL WHEN $8::text IS NULL THEN max_uses ELSE $8::int END,
           metadata_json=COALESCE($9, metadata_json),
           version=version+1,
           updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND version=$10
         RETURNING *`,
        [
          linkId,
          organizationId,
          patch.title ?? null,
          patch.description === undefined ? null : patch.description,
          patch.amountMinor === undefined ? null : patch.amountMinor,
          patch.reference === undefined ? null : patch.reference,
          patch.expiresAt === undefined ? null : patch.expiresAt === null ? '__CLEAR__' : patch.expiresAt,
          patch.maxUses === undefined ? null : patch.maxUses === null ? '__CLEAR__' : String(patch.maxUses),
          patch.metadata ? JSON.stringify(patch.metadata) : null,
          link.version,
        ],
      );
      if (!r.rows[0]) throw conflict('Payment link was modified concurrently', 'PAYMENT_LINK_CONCURRENT_MODIFICATION');
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'payment_link.update',
          resourceType: 'payment_links',
          resourceId: linkId,
          requestId: actor.requestId,
          after: {id: linkId, status: r.rows[0].status},
        },
        client,
      );
      return projectLink(r.rows[0]);
    });
  },

  async transition(
    organizationId: string,
    linkId: string,
    toStatus: PaymentLinkStatus,
    actor: Actor,
    reason?: string,
  ) {
    return withPgTransaction(async (client) => {
      let link = await lockLink(client, organizationId, linkId);
      link = await maybeExpireLink(client, link);
      assertLinkTransition(link.status as PaymentLinkStatus, toStatus);
      const extra: string[] = [];
      if (toStatus === 'ACTIVE') extra.push('activated_at=NOW()', 'deactivated_at=NULL');
      if (toStatus === 'INACTIVE') extra.push('deactivated_at=NOW()');
      if (toStatus === 'CANCELLED') extra.push('cancelled_at=NOW()');
      const r = await client.query(
        `UPDATE payment_links
         SET status=$4, version=version+1, updated_at=NOW()${extra.length ? ', ' + extra.join(', ') : ''}
         WHERE id=$1 AND organization_id=$2 AND version=$3 AND status=$5
         RETURNING *`,
        [linkId, organizationId, link.version, toStatus, link.status],
      );
      if (!r.rows[0]) throw conflict('Payment link was modified concurrently', 'PAYMENT_LINK_CONCURRENT_MODIFICATION');
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: `payment_link.${toStatus.toLowerCase()}`,
          resourceType: 'payment_links',
          resourceId: linkId,
          requestId: actor.requestId,
          metadata: {from: link.status, to: toStatus, reason},
        },
        client,
      );
      return projectLink(r.rows[0]);
    });
  },

  activate(organizationId: string, linkId: string, actor: Actor) {
    return this.transition(organizationId, linkId, 'ACTIVE', actor, 'Activated');
  },
  deactivate(organizationId: string, linkId: string, actor: Actor) {
    return this.transition(organizationId, linkId, 'INACTIVE', actor, 'Deactivated');
  },
  cancel(organizationId: string, linkId: string, actor: Actor) {
    return this.transition(organizationId, linkId, 'CANCELLED', actor, 'Cancelled');
  },
  expire(organizationId: string, linkId: string, actor: Actor) {
    return this.transition(organizationId, linkId, 'EXPIRED', actor, 'Expired by merchant');
  },

  /**
   * Reuse: reactivate an INACTIVE reusable link (not one-time, not cancelled/expired).
   * One-time links cannot be reused after success/cancel/expire.
   */
  async reuse(organizationId: string, linkId: string, actor: Actor) {
    return withPgTransaction(async (client) => {
      let link = await lockLink(client, organizationId, linkId);
      link = await maybeExpireLink(client, link);
      if (link.one_time) {
        throw conflict('One-time payment links cannot be reused', 'PAYMENT_LINK_ONE_TIME');
      }
      if (!link.reusable) {
        throw conflict('Payment link is not reusable', 'PAYMENT_LINK_NOT_REUSABLE');
      }
      if (link.status !== 'INACTIVE') {
        throw conflict(`Reuse requires INACTIVE status (current: ${link.status})`, 'PAYMENT_LINK_INVALID_TRANSITION');
      }
      if (link.max_uses != null && link.use_count >= link.max_uses) {
        throw conflict('Payment link usage limit reached', 'PAYMENT_LINK_USAGE_LIMIT');
      }
      const r = await client.query(
        `UPDATE payment_links
         SET status='ACTIVE', activated_at=NOW(), deactivated_at=NULL, version=version+1, updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND version=$3 AND status='INACTIVE'
         RETURNING *`,
        [linkId, organizationId, link.version],
      );
      if (!r.rows[0]) throw conflict('Payment link was modified concurrently', 'PAYMENT_LINK_CONCURRENT_MODIFICATION');
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'payment_link.reuse',
          resourceType: 'payment_links',
          resourceId: linkId,
          requestId: actor.requestId,
        },
        client,
      );
      return projectLink(r.rows[0]);
    });
  },

  /** Called inside checkout payment success transaction — increments use_count; may auto-expire one-time/max. */
  async recordSuccessfulUse(client: PgClient, linkId: string, organizationId: string) {
    const r = await client.query(
      `SELECT * FROM payment_links WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [linkId, organizationId],
    );
    const link = r.rows[0];
    if (!link) return;
    const useCount = Number(link.use_count) + 1;
    let status = link.status;
    const hitLimit = link.max_uses != null && useCount >= Number(link.max_uses);
    const oneTimeDone = link.one_time === true;
    if (hitLimit || oneTimeDone) status = 'EXPIRED';
    await client.query(
      `UPDATE payment_links
       SET use_count=$2, status=$3, version=version+1, updated_at=NOW()
       WHERE id=$1 AND organization_id=$4`,
      [linkId, useCount, status, organizationId],
    );
  },
};
