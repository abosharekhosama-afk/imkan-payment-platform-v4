import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';
import type {ProviderEnvironment} from './adapter.js';
import {listRegisteredAdapterCodes} from './registry.js';

export const providerAdminService = {
  async listProviders() {
    const r = await pgQuery(
      `SELECT id, code, name, status, supports_sandbox, supports_live, metadata_json, created_at
       FROM providers
       ORDER BY code`,
    );
    const registered = new Set(listRegisteredAdapterCodes());
    return r.rows.map((row) => ({
      ...row,
      adapter_registered: registered.has(row.code),
    }));
  },

  async listCapabilities(providerCode: string) {
    const r = await pgQuery(
      `SELECT c.capability_code, c.evidence_status, c.environment_scope, c.notes, c.verified_at
       FROM provider_capabilities c
       JOIN providers p ON p.id = c.provider_id
       WHERE p.code=$1
       ORDER BY c.capability_code, c.environment_scope`,
      [providerCode],
    );
    if (!r.rows.length) {
      const p = await pgQuery(`SELECT id FROM providers WHERE code=$1`, [providerCode]);
      if (!p.rows[0]) throw notFound('Provider not found', 'PROVIDER_NOT_FOUND');
    }
    return r.rows;
  },

  async listAccounts(organizationId: string) {
    const r = await pgQuery(
      `SELECT pa.id, pa.environment, pa.display_name, pa.status, pa.is_default, pa.metadata_json, pa.created_at,
              p.code AS provider_code, p.name AS provider_name
       FROM provider_accounts pa
       JOIN providers p ON p.id = pa.provider_id
       WHERE pa.organization_id=$1 OR pa.organization_id IS NULL
       ORDER BY pa.organization_id NULLS LAST, pa.environment, p.code`,
      [organizationId],
    );
    return r.rows;
  },

  async upsertRoute(input: {
    organizationId: string;
    environment: ProviderEnvironment;
    providerAccountId: string;
    currencyCode?: string | null;
    paymentMethodTypeCode?: string | null;
    priority?: number;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    return withPgTransaction(async (client) => {
      const acc = await client.query(
        `SELECT pa.id, pa.organization_id, pa.environment, pa.status, p.code
         FROM provider_accounts pa
         JOIN providers p ON p.id = pa.provider_id
         WHERE pa.id=$1`,
        [input.providerAccountId],
      );
      if (!acc.rows[0]) throw notFound('Provider account not found', 'PROVIDER_ACCOUNT_NOT_FOUND');
      const a = acc.rows[0];
      if (a.organization_id && a.organization_id !== input.organizationId) {
        throw new AppError('PROVIDER_TENANT_ISOLATION', 'Cannot route to another tenant account', 403);
      }
      if (a.environment !== input.environment) {
        throw new AppError('PROVIDER_ENVIRONMENT_MISMATCH', 'Route environment must match account environment', 409);
      }
      if (a.status !== 'ACTIVE') {
        throw new AppError('PROVIDER_ACCOUNT_DISABLED', 'Provider account is not active', 409);
      }

      // Replace default wildcard route for this org + environment (one primary provider per plane).
      await client.query(
        `DELETE FROM provider_routes
         WHERE organization_id=$1 AND environment=$2
           AND currency_code IS NULL AND payment_method_type_code IS NULL`,
        [input.organizationId, input.environment],
      );

      const r = await client.query(
        `INSERT INTO provider_routes (
           organization_id, environment, currency_code, payment_method_type_code,
           provider_account_id, priority, is_active
         ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
         RETURNING *`,
        [
          input.organizationId,
          input.environment,
          input.currencyCode || null,
          input.paymentMethodTypeCode || null,
          input.providerAccountId,
          input.priority ?? 100,
        ],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId || null,
          action: 'provider_route.created',
          resourceType: 'provider_route',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
          metadata: {provider_code: a.code, environment: input.environment},
        },
        client,
      );
      return r.rows[0];
    });
  },

  async listRoutes(organizationId: string) {
    const r = await pgQuery(
      `SELECT pr.*, p.code AS provider_code
       FROM provider_routes pr
       JOIN provider_accounts pa ON pa.id = pr.provider_account_id
       JOIN providers p ON p.id = pa.provider_id
       WHERE pr.organization_id=$1
       ORDER BY pr.environment, pr.priority, pr.created_at`,
      [organizationId],
    );
    return r.rows;
  },

  async createOrgAccount(input: {
    organizationId: string;
    providerCode: string;
    environment: ProviderEnvironment;
    displayName?: string;
    setDefault?: boolean;
    actorUserId?: string | null;
    requestId?: string;
  }) {
    return withPgTransaction(async (client) => {
      const provider = await client.query(
        `SELECT id, code, status FROM providers WHERE code=$1`,
        [input.providerCode],
      );
      if (!provider.rows[0]) throw notFound('Provider not found', 'PROVIDER_NOT_FOUND');
      if (provider.rows[0].status !== 'ACTIVE') {
        throw new AppError('PROVIDER_DISABLED', 'Provider is disabled', 409);
      }
      if (input.setDefault) {
        await client.query(
          `UPDATE provider_accounts SET is_default=FALSE, updated_at=NOW()
           WHERE organization_id=$1 AND environment=$2`,
          [input.organizationId, input.environment],
        );
      }
      const r = await client.query(
        `INSERT INTO provider_accounts (
           organization_id, provider_id, environment, display_name, status, is_default, metadata_json
         ) VALUES ($1,$2,$3,$4,'ACTIVE',$5,'{"owned":true}'::jsonb)
         ON CONFLICT ON CONSTRAINT provider_accounts_org_provider_env_uq DO UPDATE SET
           display_name = EXCLUDED.display_name,
           status = 'ACTIVE',
           is_default = EXCLUDED.is_default,
           updated_at = NOW()
         RETURNING *`,
        [
          input.organizationId,
          provider.rows[0].id,
          input.environment,
          input.displayName || `${provider.rows[0].code} ${input.environment}`,
          input.setDefault !== false,
        ],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId || null,
          action: 'provider_account.created',
          resourceType: 'provider_account',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
          metadata: {provider_code: input.providerCode, environment: input.environment},
        },
        client,
      );
      return {...r.rows[0], provider_code: input.providerCode};
    });
  },
};
