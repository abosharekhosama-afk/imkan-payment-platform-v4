import {pgQuery, withPgTransaction, type PgClient} from '../infrastructure/db/postgres.js';
import {AppError, notFound} from '../foundation/errors.js';
import {writeAuditEvent} from '../foundation/audit.js';

/**
 * Master data registry (spec §9). Every type maps to a dedicated PostgreSQL table.
 * Reads of active records are available to any authenticated user (reference data);
 * mutations require masterdata.manage (platform) and are audited.
 */
const MASTER_TYPES: Record<string, string> = {
  countries: 'master_countries',
  currencies: 'master_currencies',
  'legal-entity-types': 'master_legal_entity_types',
  'business-types': 'master_business_types',
  industries: 'master_industries',
  'document-types': 'master_document_types',
  'tax-types': 'master_tax_types',
  'payout-methods': 'master_payout_methods',
  'payment-method-types': 'master_payment_method_types',
  'provider-types': 'master_provider_types',
  'provider-capabilities': 'master_provider_capabilities',
  'fee-types': 'master_fee_types',
  'risk-categories': 'master_risk_categories',
  'webhook-event-types': 'master_webhook_event_types',
  'address-types': 'master_address_types',
  'identification-types': 'master_identification_types',
};

/** Extra typed columns per table (business-critical attributes are NOT metadata_json). */
const EXTRA_COLUMNS: Record<string, string[]> = {
  master_countries: ['iso3'],
  master_currencies: ['minor_units'],
};

export function masterTableFor(type: string): string {
  const table = MASTER_TYPES[type];
  if (!table) throw notFound(`Unknown master data type: ${type}`, 'MASTER_TYPE_NOT_FOUND');
  return table;
}

export function listMasterTypes(): string[] {
  return Object.keys(MASTER_TYPES);
}

function selectColumns(table: string): string {
  const extras = EXTRA_COLUMNS[table] || [];
  const base = ['id', 'code', 'name', 'labels_json', 'description', 'is_active', 'sort_order', 'metadata_json', 'retired_at', 'created_at', 'updated_at'];
  return [...base.slice(0, 2), ...extras, ...base.slice(2)].join(', ');
}

export const masterDataService = {
  async list(type: string, includeInactive: boolean) {
    const table = masterTableFor(type);
    const where = includeInactive ? '' : 'WHERE is_active = TRUE';
    const r = await pgQuery(
      `SELECT ${selectColumns(table)} FROM ${table} ${where} ORDER BY sort_order, code`,
    );
    return r.rows;
  },

  async getByCode(type: string, code: string) {
    const table = masterTableFor(type);
    const r = await pgQuery(`SELECT ${selectColumns(table)} FROM ${table} WHERE code=$1`, [code]);
    if (!r.rows[0]) throw notFound(`Master record not found: ${type}/${code}`, 'MASTER_RECORD_NOT_FOUND');
    return r.rows[0];
  },

  async create(
    type: string,
    input: {
      code: string;
      name: string;
      description?: string;
      labels?: Record<string, string>;
      sortOrder?: number;
      metadata?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    },
    actor: {userId: string; requestId?: string},
  ) {
    const table = masterTableFor(type);
    const allowedExtras = EXTRA_COLUMNS[table] || [];
    const extras = Object.entries(input.extra || {}).filter(([k]) => allowedExtras.includes(k));
    const extraCols = extras.map(([k]) => k);
    const extraVals = extras.map(([, v]) => v);

    return withPgTransaction(async (client) => {
      const cols = ['code', 'name', 'description', 'labels_json', 'sort_order', 'metadata_json', ...extraCols];
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      const values = [
        input.code,
        input.name,
        input.description || null,
        JSON.stringify(input.labels || {}),
        input.sortOrder ?? 0,
        JSON.stringify(input.metadata || {}),
        ...extraVals,
      ];
      let row;
      try {
        const r = await client.query(
          `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
           RETURNING ${selectColumns(table)}`,
          values,
        );
        row = r.rows[0];
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new AppError('MASTER_CODE_EXISTS', `Code already exists: ${input.code}`, 409);
        }
        throw error;
      }
      await writeAuditEvent(
        {
          actorUserId: actor.userId,
          action: 'masterdata.create',
          resourceType: table,
          resourceId: row.id,
          requestId: actor.requestId,
          after: row,
        },
        client,
      );
      return row;
    });
  },

  async update(
    type: string,
    code: string,
    patch: {
      name?: string;
      description?: string;
      labels?: Record<string, string>;
      sortOrder?: number;
      metadata?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    },
    actor: {userId: string; requestId?: string},
  ) {
    const table = masterTableFor(type);
    const allowedExtras = EXTRA_COLUMNS[table] || [];
    return withPgTransaction(async (client) => {
      const before = await client.query(`SELECT ${selectColumns(table)} FROM ${table} WHERE code=$1 FOR UPDATE`, [code]);
      if (!before.rows[0]) throw notFound(`Master record not found: ${type}/${code}`, 'MASTER_RECORD_NOT_FOUND');

      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (sql: string, v: unknown) => {
        values.push(v);
        sets.push(`${sql}=$${values.length}`);
      };
      if (patch.name !== undefined) push('name', patch.name);
      if (patch.description !== undefined) push('description', patch.description);
      if (patch.labels !== undefined) push('labels_json', JSON.stringify(patch.labels));
      if (patch.sortOrder !== undefined) push('sort_order', patch.sortOrder);
      if (patch.metadata !== undefined) push('metadata_json', JSON.stringify(patch.metadata));
      for (const [k, v] of Object.entries(patch.extra || {})) {
        if (allowedExtras.includes(k)) push(k, v);
      }
      if (!sets.length) return before.rows[0];
      sets.push(`updated_at=NOW()`);
      values.push(code);
      const r = await client.query(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE code=$${values.length} RETURNING ${selectColumns(table)}`,
        values,
      );
      await writeAuditEvent(
        {
          actorUserId: actor.userId,
          action: 'masterdata.update',
          resourceType: table,
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          before: before.rows[0],
          after: r.rows[0],
        },
        client,
      );
      return r.rows[0];
    });
  },

  /**
   * Soft lifecycle only: records referenced by live business data are never
   * destructively deleted — deactivation hides them from new selections.
   */
  async setActive(type: string, code: string, active: boolean, actor: {userId: string; requestId?: string}) {
    const table = masterTableFor(type);
    return withPgTransaction(async (client) => {
      const before = await client.query(`SELECT ${selectColumns(table)} FROM ${table} WHERE code=$1 FOR UPDATE`, [code]);
      if (!before.rows[0]) throw notFound(`Master record not found: ${type}/${code}`, 'MASTER_RECORD_NOT_FOUND');
      const r = await client.query(
        `UPDATE ${table}
         SET is_active=$2, retired_at=CASE WHEN $2 THEN NULL ELSE NOW() END, updated_at=NOW()
         WHERE code=$1
         RETURNING ${selectColumns(table)}`,
        [code, active],
      );
      await writeAuditEvent(
        {
          actorUserId: actor.userId,
          action: active ? 'masterdata.activate' : 'masterdata.deactivate',
          resourceType: table,
          resourceId: r.rows[0].id,
          requestId: actor.requestId,
          before: before.rows[0],
          after: r.rows[0],
        },
        client,
      );
      return r.rows[0];
    });
  },
};

/** Resolve an active master record id by code (service-layer validation on top of DB FKs). */
export async function resolveMasterId(
  table: string,
  code: string,
  client?: PgClient,
  {allowInactive = false}: {allowInactive?: boolean} = {},
): Promise<string> {
  const sql = `SELECT id, is_active FROM ${table} WHERE code=$1`;
  const r = client ? await client.query(sql, [code]) : await pgQuery(sql, [code]);
  const row = r.rows[0] as {id: string; is_active: boolean} | undefined;
  if (!row) throw new AppError('MASTER_CODE_INVALID', `Unknown reference code: ${code}`, 400);
  if (!row.is_active && !allowInactive) {
    throw new AppError('MASTER_CODE_INACTIVE', `Reference code is inactive: ${code}`, 400);
  }
  return row.id;
}
