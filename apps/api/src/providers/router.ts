import {config} from '../config.js';
import {pgQuery, type PgClient} from '../infrastructure/db/postgres.js';
import type {ProviderAdapter, ProviderEnvironment, ProviderOperationResult} from './adapter.js';
import {ProviderError, shouldQueryBeforeRetry} from './errors.js';
import {getProviderAdapter} from './registry.js';
import './registry.js';

const DEFAULT_PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 12_000);

export type ResolvedProvider = {
  providerId: string;
  providerCode: string;
  providerAccountId: string;
  environment: ProviderEnvironment;
  organizationId: string;
  adapter: ProviderAdapter;
};

export function resolvePaymentEnvironment(): ProviderEnvironment {
  // Production appEnv maps to LIVE credential plane; sandbox provider still cannot run LIVE.
  if (config.appEnv === 'production' || config.appEnv === 'live') return 'LIVE';
  return 'SANDBOX';
}

async function assertCapability(
  providerId: string,
  capabilityCode: string,
  environment: ProviderEnvironment,
): Promise<void> {
  const r = await pgQuery(
    `SELECT evidence_status, environment_scope
     FROM provider_capabilities
     WHERE provider_id=$1 AND capability_code=$2
       AND environment_scope IN ($3, 'ANY')
     ORDER BY CASE environment_scope WHEN $3 THEN 0 ELSE 1 END
     LIMIT 1`,
    [providerId, capabilityCode, environment],
  );
  const row = r.rows[0];
  if (!row) {
    throw new ProviderError(
      'PROVIDER_CAPABILITY_UNKNOWN',
      `Capability ${capabilityCode} has no evidence row for this provider`,
      'CAPABILITY',
      503,
    );
  }
  if (row.evidence_status === 'UNSUPPORTED') {
    throw new ProviderError(
      'PROVIDER_CAPABILITY_UNSUPPORTED',
      `Capability ${capabilityCode} is UNSUPPORTED`,
      'CAPABILITY',
      501,
    );
  }
  if (row.evidence_status === 'UNKNOWN') {
    throw new ProviderError(
      'PROVIDER_CAPABILITY_UNKNOWN',
      `Capability ${capabilityCode} evidence is UNKNOWN — not enabled`,
      'CAPABILITY',
      503,
    );
  }
  // VERIFIED and PARTIAL allowed for routing (PARTIAL still documented as limited)
}

export const providerRouter = {
  async resolve(input: {
    organizationId: string;
    environment?: ProviderEnvironment;
    currencyCode?: string;
    paymentMethodTypeCode?: string;
    requiredCapability: string;
    providerAccountId?: string;
  }): Promise<ResolvedProvider> {
    const environment = input.environment || resolvePaymentEnvironment();

    // Explicit account
    if (input.providerAccountId) {
      const acc = await pgQuery(
        `SELECT pa.id, pa.organization_id, pa.environment, pa.status AS account_status,
                p.id AS provider_id, p.code AS provider_code, p.status AS provider_status,
                p.supports_sandbox, p.supports_live
         FROM provider_accounts pa
         JOIN providers p ON p.id = pa.provider_id
         WHERE pa.id=$1`,
        [input.providerAccountId],
      );
      if (!acc.rows[0]) {
        throw new ProviderError('PROVIDER_ACCOUNT_NOT_FOUND', 'Provider account not found', 'DISABLED', 404);
      }
      const row = acc.rows[0];
      if (row.organization_id && row.organization_id !== input.organizationId) {
        throw new ProviderError('PROVIDER_TENANT_ISOLATION', 'Provider account belongs to another tenant', 'DISABLED', 403);
      }
      return finalizeResolve(row, input.organizationId, environment, input.requiredCapability);
    }

    // Org routes (currency-specific first, then wildcard)
    const routes = await pgQuery(
      `SELECT pa.id, pa.organization_id, pa.environment, pa.status AS account_status,
              p.id AS provider_id, p.code AS provider_code, p.status AS provider_status,
              p.supports_sandbox, p.supports_live, pr.priority, pr.currency_code
       FROM provider_routes pr
       JOIN provider_accounts pa ON pa.id = pr.provider_account_id
       JOIN providers p ON p.id = pa.provider_id
       WHERE pr.organization_id=$1 AND pr.environment=$2 AND pr.is_active=TRUE
         AND pa.status='ACTIVE' AND p.status='ACTIVE'
         AND (pr.currency_code IS NULL OR pr.currency_code=$3)
         AND (pr.payment_method_type_code IS NULL OR pr.payment_method_type_code=$4)
       ORDER BY
         CASE WHEN pr.currency_code IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN pr.payment_method_type_code IS NOT NULL THEN 0 ELSE 1 END,
         pr.priority ASC,
         pr.created_at ASC
       LIMIT 1`,
      [
        input.organizationId,
        environment,
        input.currencyCode || null,
        input.paymentMethodTypeCode || null,
      ],
    );
    if (routes.rows[0]) {
      return finalizeResolve(routes.rows[0], input.organizationId, environment, input.requiredCapability);
    }

    // Org default account for environment
    const def = await pgQuery(
      `SELECT pa.id, pa.organization_id, pa.environment, pa.status AS account_status,
              p.id AS provider_id, p.code AS provider_code, p.status AS provider_status,
              p.supports_sandbox, p.supports_live
       FROM provider_accounts pa
       JOIN providers p ON p.id = pa.provider_id
       WHERE pa.organization_id=$1 AND pa.environment=$2 AND pa.is_default=TRUE
         AND pa.status='ACTIVE' AND p.status='ACTIVE'
       LIMIT 1`,
      [input.organizationId, environment],
    );
    if (def.rows[0]) {
      return finalizeResolve(def.rows[0], input.organizationId, environment, input.requiredCapability);
    }

    // Platform shared sandbox only — never fall back to LIVE shared
    if (environment === 'SANDBOX') {
      const shared = await pgQuery(
        `SELECT pa.id, pa.organization_id, pa.environment, pa.status AS account_status,
                p.id AS provider_id, p.code AS provider_code, p.status AS provider_status,
                p.supports_sandbox, p.supports_live
         FROM provider_accounts pa
         JOIN providers p ON p.id = pa.provider_id
         WHERE pa.organization_id IS NULL AND pa.environment='SANDBOX'
           AND p.code='sandbox' AND pa.status='ACTIVE' AND p.status='ACTIVE'
         LIMIT 1`,
      );
      if (shared.rows[0]) {
        return finalizeResolve(shared.rows[0], input.organizationId, environment, input.requiredCapability);
      }
    }

    throw new ProviderError(
      'PROVIDER_ROUTE_NOT_FOUND',
      `No active provider route/account for environment ${environment}`,
      'DISABLED',
      503,
    );
  },

  /**
   * Execute a provider operation with timeout, idempotency persistence, and safe failure mapping.
   * Ambiguous/timeout outcomes are recorded; callers must query-before-retry — never blind re-charge.
   */
  async run(input: {
    resolved: ResolvedProvider;
    operation:
      | 'AUTHORIZE'
      | 'CAPTURE'
      | 'VOID'
      | 'REFUND'
      | 'STATUS'
      | 'TOKENIZE'
      | 'CHECKOUT_PREPARE';
    paymentIntentId?: string | null;
    paymentAttemptId?: string | null;
    idempotencyKey?: string | null;
    timeoutMs?: number;
    client?: PgClient;
    fn: () => Promise<ProviderOperationResult>;
  }): Promise<ProviderOperationResult & {queryBeforeRetry?: boolean; providerTransactionIdDb?: string}> {
    const exec = input.client
      ? (text: string, params?: unknown[]) => input.client!.query(text, params)
      : (text: string, params?: unknown[]) => pgQuery(text, params);

    if (input.idempotencyKey) {
      const existing = await exec(
        `SELECT id, status, provider_reference, provider_transaction_id, error_code, error_message, metadata_json
         FROM provider_transactions
         WHERE organization_id=$1 AND request_idempotency_key=$2`,
        [input.resolved.organizationId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        return {
          status: row.status,
          providerCode: input.resolved.providerCode,
          providerReference: row.provider_reference || undefined,
          providerTransactionId: row.provider_transaction_id || undefined,
          failureCode: row.error_code || undefined,
          failureMessage: row.error_message || undefined,
          details: typeof row.metadata_json === 'object' ? row.metadata_json : {},
          providerTransactionIdDb: row.id,
          queryBeforeRetry: row.status === 'AMBIGUOUS',
        };
      }
    }

    const timeoutMs = input.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    let result: ProviderOperationResult;
    try {
      result = await withTimeout(input.fn(), timeoutMs, input.resolved.providerCode);
    } catch (error) {
      if (error instanceof ProviderError) {
        const inserted = await exec(
          `INSERT INTO provider_transactions (
             organization_id, provider_id, provider_account_id, payment_intent_id, payment_attempt_id,
             operation, environment, status, request_idempotency_key, error_code, error_message, metadata_json
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            input.resolved.organizationId,
            input.resolved.providerId,
            input.resolved.providerAccountId,
            input.paymentIntentId || null,
            input.paymentAttemptId || null,
            input.operation,
            input.resolved.environment,
            error.errorClass === 'TIMEOUT' || error.errorClass === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'FAILED',
            input.idempotencyKey || null,
            error.code,
            error.message,
            JSON.stringify({error_class: error.errorClass, query_before_retry: shouldQueryBeforeRetry(error)}),
          ],
        );
        const mapped: ProviderOperationResult & {queryBeforeRetry?: boolean; providerTransactionIdDb?: string} = {
          status: error.errorClass === 'TIMEOUT' || error.errorClass === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'FAILED',
          providerCode: input.resolved.providerCode,
          failureCode: error.code,
          failureMessage: error.message,
          queryBeforeRetry: shouldQueryBeforeRetry(error),
          providerTransactionIdDb: inserted.rows[0]?.id,
        };
        if (shouldQueryBeforeRetry(error)) {
          // Surface without re-throwing as success path — Payment Core must not re-charge.
          return mapped;
        }
        throw error;
      }
      throw error;
    }

    const inserted = await exec(
      `INSERT INTO provider_transactions (
         organization_id, provider_id, provider_account_id, payment_intent_id, payment_attempt_id,
         operation, environment, provider_reference, provider_transaction_id, status,
         request_idempotency_key, error_code, error_message, metadata_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        input.resolved.organizationId,
        input.resolved.providerId,
        input.resolved.providerAccountId,
        input.paymentIntentId || null,
        input.paymentAttemptId || null,
        input.operation,
        input.resolved.environment,
        result.providerReference || null,
        result.providerTransactionId || null,
        result.status,
        input.idempotencyKey || null,
        result.failureCode || null,
        result.failureMessage || null,
        JSON.stringify({
          ...(result.details || {}),
          query_before_retry: result.status === 'AMBIGUOUS',
        }),
      ],
    );

    return {
      ...result,
      providerTransactionIdDb: inserted.rows[0]?.id,
      queryBeforeRetry: result.status === 'AMBIGUOUS',
    };
  },
};

async function finalizeResolve(
  row: any,
  organizationId: string,
  environment: ProviderEnvironment,
  requiredCapability: string,
): Promise<ResolvedProvider> {
  if (row.environment !== environment) {
    throw new ProviderError(
      'PROVIDER_ENVIRONMENT_MISMATCH',
      `Account environment ${row.environment} does not match requested ${environment}`,
      'ENVIRONMENT',
      409,
      {providerCode: row.provider_code},
    );
  }
  if (row.provider_status !== 'ACTIVE') {
    throw new ProviderError(
      'PROVIDER_DISABLED',
      `Provider ${row.provider_code} is disabled`,
      'DISABLED',
      503,
      {providerCode: row.provider_code},
    );
  }
  if (row.account_status !== 'ACTIVE') {
    throw new ProviderError(
      'PROVIDER_ACCOUNT_DISABLED',
      'Provider account is not active',
      'DISABLED',
      503,
      {providerCode: row.provider_code},
    );
  }
  if (environment === 'SANDBOX' && !row.supports_sandbox) {
    throw new ProviderError(
      'PROVIDER_SANDBOX_UNSUPPORTED',
      'Provider does not support SANDBOX',
      'ENVIRONMENT',
      409,
      {providerCode: row.provider_code},
    );
  }
  if (environment === 'LIVE' && !row.supports_live) {
    throw new ProviderError(
      'PROVIDER_LIVE_UNSUPPORTED',
      'Provider does not support LIVE (sandbox-only providers cannot execute live)',
      'ENVIRONMENT',
      409,
      {providerCode: row.provider_code},
    );
  }
  // Credential plane isolation: reject LIVE credentials metadata on SANDBOX accounts and vice versa
  const creds = await pgQuery(
    `SELECT environment, status FROM provider_credentials_metadata
     WHERE provider_account_id=$1 AND status='ACTIVE'`,
    [row.id],
  );
  for (const c of creds.rows) {
    if (c.environment !== environment) {
      throw new ProviderError(
        'PROVIDER_CREDENTIAL_ENV_MISMATCH',
        'Active credential metadata environment does not match account environment',
        'ENVIRONMENT',
        409,
        {providerCode: row.provider_code},
      );
    }
  }

  await assertCapability(row.provider_id, requiredCapability, environment);
  const adapter = getProviderAdapter(row.provider_code);

  return {
    providerId: row.provider_id,
    providerCode: row.provider_code,
    providerAccountId: row.id,
    environment,
    organizationId,
    adapter,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, providerCode: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ProviderError('PROVIDER_TIMEOUT', `Provider operation timed out after ${ms}ms`, 'TIMEOUT', 504, {
          providerCode,
        }),
      );
    }, ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
