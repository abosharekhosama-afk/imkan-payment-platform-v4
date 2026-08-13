/**
 * Per-account webhook secrets (merchant_provider_credentials.secret_ref).
 * Secrets stay in SecretResolver / env — never stored as plaintext in PostgreSQL.
 */
import {pgQuery} from '../infrastructure/db/postgres.js';
import {resolveSecretRef} from '../security/secrets/index.js';
import type {ProviderEnvironment} from './adapter.js';

export async function resolveMerchantWebhookSecret(
  providerCode: string,
  environment: ProviderEnvironment,
  organizationId?: string | null,
): Promise<string | null> {
  const params: unknown[] = [providerCode, environment];
  let orgFilter = '';
  if (organizationId) {
    params.push(organizationId);
    orgFilter = ` AND mpc.organization_id=$${params.length}`;
  }
  const r = await pgQuery(
    `SELECT mpc.secret_ref
     FROM merchant_provider_credentials mpc
     JOIN provider_accounts pa ON pa.id = mpc.provider_account_id
     JOIN providers p ON p.id = pa.provider_id
     WHERE p.code=$1
       AND mpc.environment=$2
       AND mpc.credential_kind IN ('webhook_secret', 'server_key')
       AND mpc.status='ACTIVE'
       ${orgFilter}
     ORDER BY mpc.updated_at DESC
     LIMIT 1`,
    params,
  );
  const secretRef = r.rows[0]?.secret_ref as string | undefined;
  if (!secretRef) return null;
  try {
    const resolved = await resolveSecretRef(secretRef, 'webhook_secret');
    return resolved?.value || null;
  } catch {
    return null;
  }
}
