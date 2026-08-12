import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import {pgQuery, withPgTransaction, pgPing} from '../infrastructure/db/postgres.js';
import {redisPing} from '../infrastructure/db/redis.js';
import {config} from '../config.js';
import {rateLimitStoreReady} from '../foundation/rate-limit-bootstrap.js';
import {resolveSecretBackendKind} from '../security/secrets/index.js';
import {getPlatformRuntimeConfig} from './runtime-config.js';
import {getEmailTransport} from './email-transport.js';
import {toCsv} from './csv-export.js';
import {merchantOutboundWebhooks} from '../webhooks/merchant-outbound-webhooks.js';

export const platformAdminService = {
  async listOrganizations(filter: {status?: string; search?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (filter.status) {
      params.push(filter.status);
      clauses.push(`o.status=$${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search.trim()}%`);
      const n = params.length;
      clauses.push(`(o.name ILIKE $${n} OR o.slug ILIKE $${n})`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT o.id, o.name, o.slug, o.status, o.country_code, o.created_at,
              mp.trading_name, mp.support_email,
              kyb.status AS kyb_status, kyb.submitted_at AS kyb_submitted_at,
              (SELECT COUNT(*)::int FROM organization_users ou WHERE ou.organization_id = o.id AND ou.status='ACTIVE') AS member_count,
              (SELECT COUNT(*)::int FROM payment_transactions pt WHERE pt.organization_id = o.id AND pt.status='SUCCEEDED') AS payment_count
       FROM organizations o
       LEFT JOIN merchant_profiles mp ON mp.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT vc.status, vc.submitted_at
         FROM verification_cases vc
         WHERE vc.organization_id = o.id AND vc.case_type = 'KYB'
         ORDER BY vc.created_at DESC
         LIMIT 1
       ) kyb ON TRUE
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async getOrganization(organizationId: string) {
    const org = await pgQuery(
      `SELECT o.id, o.name, o.slug, o.status, o.country_code, o.created_at, o.updated_at,
              os.default_currency, os.locale, os.timezone
       FROM organizations o
       LEFT JOIN organization_settings os ON os.organization_id = o.id
       WHERE o.id=$1`,
      [organizationId],
    );
    if (!org.rows[0]) throw notFound('Organization not found', 'ORG_NOT_FOUND');

    const [
      merchant,
      legal,
      business,
      kyb,
      members,
      paymentsSummary,
      documents,
      recentAudit,
      recentSecurity,
      recentErrors,
    ] = await Promise.all([
      pgQuery(`SELECT * FROM merchant_profiles WHERE organization_id=$1`, [organizationId]),
      pgQuery(
        `SELECT clp.legal_name, clp.trading_name, clp.registration_number, clp.tax_id, clp.vat_number,
                met.code AS legal_entity_type_code, mc.code AS incorporation_country_code, clp.incorporation_date
         FROM company_legal_profiles clp
         LEFT JOIN master_legal_entity_types met ON met.id = clp.legal_entity_type_id
         LEFT JOIN master_countries mc ON mc.id = clp.incorporation_country_id
         WHERE clp.organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT bp.description, mi.code AS industry_code, mbt.code AS business_type_code
         FROM business_profiles bp
         LEFT JOIN master_industries mi ON mi.id = bp.industry_id
         LEFT JOIN master_business_types mbt ON mbt.id = bp.business_type_id
         WHERE bp.organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT id, status, risk_category_id, submitted_at, decided_at, created_at, updated_at
         FROM verification_cases
         WHERE organization_id=$1 AND case_type='KYB'
         ORDER BY created_at DESC
         LIMIT 1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT u.id, u.email, u.name, u.status, ou.joined_at,
                COALESCE(array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
         FROM organization_users ou
         JOIN users u ON u.id = ou.user_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.organization_id = ou.organization_id
         LEFT JOIN roles r ON r.id = ur.role_id
         WHERE ou.organization_id=$1
         GROUP BY u.id, u.email, u.name, u.status, ou.joined_at
         ORDER BY ou.joined_at NULLS LAST
         LIMIT 50`,
        [organizationId],
      ),
      pgQuery(
        `SELECT COUNT(*) FILTER (WHERE status='SUCCEEDED')::int AS succeeded_count,
                COUNT(*)::int AS total_count,
                MAX(captured_at) AS last_captured_at,
                COALESCE(SUM(amount_minor) FILTER (WHERE status='SUCCEEDED'), 0)::text AS succeeded_volume_minor
         FROM payment_transactions
         WHERE organization_id=$1`,
        [organizationId],
      ),
      pgQuery(
        `SELECT d.id, mdt.code AS document_type_code, d.status, d.file_name, d.created_at,
                (d.storage_key IS NOT NULL) AS has_file
         FROM documents d
         JOIN master_document_types mdt ON mdt.id = d.document_type_id
         WHERE d.organization_id=$1
         ORDER BY d.created_at DESC
         LIMIT 50`,
        [organizationId],
      ),
      pgQuery(
        `SELECT id, actor_user_id, action, resource_type, resource_id, request_id, created_at
         FROM audit_events
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT 25`,
        [organizationId],
      ),
      pgQuery(
        `SELECT id, user_id, event_type, success, ip, created_at
         FROM security_events
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT 25`,
        [organizationId],
      ),
      pgQuery(
        `SELECT id, user_id, request_id, method, route, status_code, error_code, message, created_at
         FROM error_reports
         WHERE organization_id=$1
         ORDER BY created_at DESC
         LIMIT 25`,
        [organizationId],
      ),
    ]);

    return {
      organization: org.rows[0],
      merchant_profile: merchant.rows[0] || null,
      legal_profile: legal.rows[0] || null,
      business_profile: business.rows[0] || null,
      kyb_case: kyb.rows[0] || null,
      members: members.rows,
      payments_summary: paymentsSummary.rows[0] || null,
      documents: documents.rows,
      recent_audit: recentAudit.rows,
      recent_security: recentSecurity.rows,
      recent_errors: recentErrors.rows,
    };
  },

  async listAuditEvents(filter: {organizationId?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    let where = '';
    if (filter.organizationId) {
      params.push(filter.organizationId);
      where = `WHERE ae.organization_id=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT ae.id, ae.organization_id, o.name AS organization_name, ae.actor_user_id, ae.action,
              ae.resource_type, ae.resource_id, ae.request_id, ae.created_at
       FROM audit_events ae
       LEFT JOIN organizations o ON o.id = ae.organization_id
       ${where}
       ORDER BY ae.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async listSecurityEvents(filter: {organizationId?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    let where = '';
    if (filter.organizationId) {
      params.push(filter.organizationId);
      where = `WHERE se.organization_id=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT se.id, se.organization_id, o.name AS organization_name, se.user_id, se.event_type,
              se.success, se.ip, se.created_at
       FROM security_events se
       LEFT JOIN organizations o ON o.id = se.organization_id
       ${where}
       ORDER BY se.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async listErrorReports(filter: {organizationId?: string; limit: number; offset: number}) {
    const params: unknown[] = [];
    let where = '';
    if (filter.organizationId) {
      params.push(filter.organizationId);
      where = `WHERE er.organization_id=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT er.id, er.organization_id, o.name AS organization_name, er.user_id, er.request_id,
              er.method, er.route, er.status_code, er.error_code, er.message, er.created_at
       FROM error_reports er
       LEFT JOIN organizations o ON o.id = er.organization_id
       ${where}
       ORDER BY er.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async updateOrganizationSettings(
    organizationId: string,
    input: {
      name?: string;
      default_currency?: string | null;
      locale?: string | null;
      timezone?: string | null;
    },
    actor: {userId: string; requestId?: string},
  ) {
    return withPgTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM organizations WHERE id=$1 FOR UPDATE`, [organizationId]);
      if (!existing.rows[0]) throw notFound('Organization not found', 'ORG_NOT_FOUND');
      const before = existing.rows[0];
      let org = before;
      if (input.name !== undefined) {
        const name = input.name.trim();
        if (name.length < 2) throw new AppError('INVALID_NAME', 'Organization name is too short', 400);
        const updated = await client.query(
          `UPDATE organizations SET name=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [organizationId, name],
        );
        org = updated.rows[0];
      }
      if (
        input.default_currency !== undefined ||
        input.locale !== undefined ||
        input.timezone !== undefined
      ) {
        await client.query(
          `INSERT INTO organization_settings (organization_id, default_currency, locale, timezone)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (organization_id) DO UPDATE SET
             default_currency=COALESCE($2, organization_settings.default_currency),
             locale=COALESCE($3, organization_settings.locale),
             timezone=COALESCE($4, organization_settings.timezone),
             updated_at=NOW()`,
          [
            organizationId,
            input.default_currency?.trim().toUpperCase() || null,
            input.locale?.trim() || null,
            input.timezone?.trim() || null,
          ],
        );
      }
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'platform.organization.updated',
          resourceType: 'organization',
          resourceId: organizationId,
          requestId: actor.requestId,
          before: {name: before.name},
          after: input,
        },
        client,
      );
      return org;
    });
  },

  async listWebhookDeliveries(filter: {
    organizationId?: string;
    status?: string;
    limit: number;
    offset: number;
  }) {
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (filter.organizationId) {
      params.push(filter.organizationId);
      clauses.push(`d.organization_id=$${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      clauses.push(`d.status=$${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT d.id, d.organization_id, o.name AS organization_name, d.endpoint_id, w.url AS endpoint_url,
              d.outbox_event_id, d.event_type, d.status, d.attempt, d.response_code, d.last_error,
              d.next_retry_at, d.delivered_at, d.created_at
       FROM merchant_webhook_deliveries d
       JOIN organizations o ON o.id = d.organization_id
       JOIN merchant_webhook_endpoints w ON w.id = d.endpoint_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows;
  },

  async exportOrganizationsCsv() {
    const rows = await this.listOrganizations({limit: 5000, offset: 0});
    return toCsv(rows, [
      {key: 'id', header: 'id'},
      {key: 'name', header: 'name'},
      {key: 'slug', header: 'slug'},
      {key: 'status', header: 'status'},
      {key: 'country_code', header: 'country_code'},
      {key: 'kyb_status', header: 'kyb_status'},
      {key: 'member_count', header: 'member_count'},
      {key: 'payment_count', header: 'payment_count'},
      {key: 'created_at', header: 'created_at'},
    ]);
  },

  async exportAuditCsv(organizationId?: string) {
    const rows = await this.listAuditEvents({organizationId, limit: 5000, offset: 0});
    return toCsv(rows, [
      {key: 'id', header: 'id'},
      {key: 'organization_id', header: 'organization_id'},
      {key: 'organization_name', header: 'organization_name'},
      {key: 'action', header: 'action'},
      {key: 'actor_user_id', header: 'actor_user_id'},
      {key: 'resource_type', header: 'resource_type'},
      {key: 'resource_id', header: 'resource_id'},
      {key: 'created_at', header: 'created_at'},
    ]);
  },

  async exportOrganizationPaymentsCsv(organizationId: string) {
    const rows = await this.listOrganizationPayments(organizationId, {limit: 5000, offset: 0});
    return toCsv(rows, [
      {key: 'id', header: 'id'},
      {key: 'payment_intent_id', header: 'payment_intent_id'},
      {key: 'amount_minor', header: 'amount_minor'},
      {key: 'currency_code', header: 'currency_code'},
      {key: 'status', header: 'status'},
      {key: 'provider_code', header: 'provider_code'},
      {key: 'external_invoice_ref', header: 'external_invoice_ref'},
      {key: 'customer_email', header: 'customer_email'},
      {key: 'captured_at', header: 'captured_at'},
    ]);
  },

  retryWebhookDelivery(deliveryId: string, actorUserId: string) {
    return merchantOutboundWebhooks.retryDelivery(deliveryId, {actorUserId});
  },

  retryFailedWebhookDeliveries(filter: {organizationId?: string; actorUserId: string}) {
    return merchantOutboundWebhooks.retryFailedDeliveries({
      organizationId: filter.organizationId,
      actorUserId: filter.actorUserId,
    });
  },

  async updateOrganizationStatus(
    organizationId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actor: {userId: string; requestId?: string},
    reason?: string | null,
  ) {
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      throw new AppError('INVALID_STATUS', 'Status must be ACTIVE or SUSPENDED', 400);
    }
    return withPgTransaction(async (client) => {
      const existing = await client.query(`SELECT * FROM organizations WHERE id=$1 FOR UPDATE`, [organizationId]);
      if (!existing.rows[0]) throw notFound('Organization not found', 'ORG_NOT_FOUND');
      const before = existing.rows[0];
      if (before.status === status) return before;
      const updated = await client.query(
        `UPDATE organizations SET status=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [organizationId, status],
      );
      await writeAuditEvent(
        {
          organizationId,
          actorUserId: actor.userId,
          action: 'platform.organization.status_changed',
          resourceType: 'organization',
          resourceId: organizationId,
          requestId: actor.requestId,
          before: {status: before.status},
          after: {status, reason: reason || null},
        },
        client,
      );
      return updated.rows[0];
    });
  },

  async listOrganizationPayments(
    organizationId: string,
    filter: {status?: string; limit: number; offset: number},
  ) {
    const org = await pgQuery(`SELECT id FROM organizations WHERE id=$1`, [organizationId]);
    if (!org.rows[0]) throw notFound('Organization not found', 'ORG_NOT_FOUND');
    const params: unknown[] = [organizationId];
    let where = 'WHERE pt.organization_id=$1';
    if (filter.status) {
      params.push(filter.status);
      where += ` AND pt.status=$${params.length}`;
    }
    params.push(filter.limit, filter.offset);
    const r = await pgQuery(
      `SELECT pt.id, pt.payment_intent_id, pt.payment_link_id, pt.amount_minor, pt.currency_code,
              pt.status, pt.provider_code, pt.provider_transaction_id, pt.customer_name, pt.customer_email,
              pt.reference, pt.captured_at, pt.created_at, pl.external_invoice_ref
       FROM payment_transactions pt
       LEFT JOIN payment_links pl ON pl.id = pt.payment_link_id
       ${where}
       ORDER BY pt.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return r.rows.map((row) => ({
      ...row,
      amount_minor: row.amount_minor != null ? String(row.amount_minor) : null,
    }));
  },

  async getSystemHealth() {
    let postgres = false;
    try {
      postgres = Boolean(await pgPing());
    } catch {
      postgres = false;
    }
    const redis = await redisPing();
    const rateLimit = await rateLimitStoreReady();
    const runtime = getPlatformRuntimeConfig();
    const emailMode = getEmailTransport().mode;

    const [outboxStats, webhookStats, orgStats, pendingKyb] = await Promise.all([
      pgQuery(`SELECT status, COUNT(*)::int AS count FROM outbox_events GROUP BY status ORDER BY status`),
      pgQuery(`SELECT status, COUNT(*)::int AS count FROM merchant_webhook_deliveries GROUP BY status ORDER BY status`),
      pgQuery(`SELECT status, COUNT(*)::int AS count FROM organizations GROUP BY status ORDER BY status`),
      pgQuery(
        `SELECT COUNT(*)::int AS count FROM verification_cases WHERE case_type='KYB' AND status IN ('SUBMITTED','UNDER_REVIEW','NEEDS_INFORMATION')`,
      ),
    ]);

    const ready =
      postgres &&
      (!config.isProduction || redis === 'ok') &&
      (!rateLimit.required || rateLimit.ready);

    return {
      status: ready ? 'ready' : 'degraded',
      checks: {
        postgres,
        redis,
        rate_limit: rateLimit,
        outbox_worker_enabled: config.outboxWorkerEnabled,
        email_transport: emailMode,
        secret_backend: resolveSecretBackendKind(),
        session_transport: config.sessionTransport,
        payment_provider: config.paymentProvider || null,
      },
      runtime,
      counts: {
        outbox_by_status: outboxStats.rows,
        webhook_deliveries_by_status: webhookStats.rows,
        organizations_by_status: orgStats.rows,
        kyb_pending_review: pendingKyb.rows[0]?.count ?? 0,
      },
    };
  },
};
