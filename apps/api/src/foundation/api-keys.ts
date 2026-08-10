import crypto from 'node:crypto';
import {pgQuery, withPgTransaction} from '../infrastructure/db/postgres.js';
import {AppError, unauthorized} from './errors.js';
import {writeAuditEvent, writeSecurityEvent} from './audit.js';
import type {ProviderEnvironment} from '../providers/adapter.js';

export const API_KEY_SCOPES = [
  'payments.read',
  'payments.manage',
  'payment_links.read',
  'payment_links.manage',
  'providers.read',
  'webhooks.read',
  'customers.read',
  'customers.manage',
  'products.read',
  'products.manage',
  'prices.read',
  'prices.manage',
  'subscriptions.read',
  'subscriptions.manage',
  'invoices.read',
  'invoices.manage',
  'billing.manage',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

function hashKey(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function generateSecret(environment: ProviderEnvironment): {secret: string; prefix: string} {
  const envPrefix = environment === 'LIVE' ? 'pk_live_' : 'pk_test_';
  const random = crypto.randomBytes(24).toString('base64url');
  const secret = `${envPrefix}${random}`;
  const prefix = secret.slice(0, 16);
  return {secret, prefix};
}

export type ApiKeyAuth = {
  apiKeyId: string;
  organizationId: string;
  environment: ProviderEnvironment;
  scopes: string[];
  permissions: string[]; // mapped for requirePermission compatibility
};

/** Map API key scopes onto existing permission codes used by routes. */
function scopesToPermissions(scopes: string[]): string[] {
  const perms = new Set<string>();
  for (const s of scopes) {
    if (s === 'payments.read') perms.add('payments.read');
    if (s === 'payments.manage') {
      perms.add('payments.read');
      perms.add('payments.manage');
    }
    if (s === 'payment_links.read') perms.add('payment_links.read');
    if (s === 'payment_links.manage') {
      perms.add('payment_links.read');
      perms.add('payment_links.manage');
    }
    if (s === 'providers.read') perms.add('providers.read');
    if (s === 'webhooks.read') perms.add('webhooks.read');
    if (s === 'customers.read') perms.add('customers.read');
    if (s === 'customers.manage') {
      perms.add('customers.read');
      perms.add('customers.manage');
    }
    if (s === 'products.read') perms.add('products.read');
    if (s === 'products.manage') {
      perms.add('products.read');
      perms.add('products.manage');
    }
    if (s === 'prices.read') perms.add('prices.read');
    if (s === 'prices.manage') {
      perms.add('prices.read');
      perms.add('prices.manage');
    }
    if (s === 'subscriptions.read') perms.add('subscriptions.read');
    if (s === 'subscriptions.manage') {
      perms.add('subscriptions.read');
      perms.add('subscriptions.manage');
    }
    if (s === 'invoices.read') perms.add('invoices.read');
    if (s === 'invoices.manage') {
      perms.add('invoices.read');
      perms.add('invoices.manage');
    }
    if (s === 'billing.manage') {
      perms.add('billing.manage');
      perms.add('customers.read');
      perms.add('customers.manage');
      perms.add('products.read');
      perms.add('products.manage');
      perms.add('prices.read');
      perms.add('prices.manage');
      perms.add('subscriptions.read');
      perms.add('subscriptions.manage');
      perms.add('invoices.read');
      perms.add('invoices.manage');
    }
  }
  return [...perms];
}

export const apiKeysService = {
  async create(input: {
    organizationId: string;
    name: string;
    environment: ProviderEnvironment;
    scopes: string[];
    createdByUserId?: string | null;
    expiresAt?: string | null;
    requestId?: string;
  }) {
    for (const scope of input.scopes) {
      if (!(API_KEY_SCOPES as readonly string[]).includes(scope)) {
        throw new AppError('API_KEY_SCOPE_INVALID', `Invalid scope: ${scope}`, 400);
      }
    }
    if (input.environment === 'LIVE' && process.env.ALLOW_LIVE_API_KEYS !== 'true') {
      // Hard gate: LIVE keys require explicit opt-in until real providers are approved.
      throw new AppError(
        'LIVE_API_KEYS_DISABLED',
        'LIVE API keys are disabled until production provider activation (DEC-009)',
        403,
      );
    }

    const {secret, prefix} = generateSecret(input.environment);
    const keyHash = hashKey(secret);

    return withPgTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO api_keys (
           organization_id, name, key_prefix, key_hash, environment, scopes, status,
           expires_at, created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$8)
         RETURNING id, organization_id, name, key_prefix, environment, scopes, status, expires_at, created_at`,
        [
          input.organizationId,
          input.name,
          prefix,
          keyHash,
          input.environment,
          input.scopes,
          input.expiresAt || null,
          input.createdByUserId || null,
        ],
      );
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.createdByUserId || null,
          action: 'api_key.created',
          resourceType: 'api_key',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
          metadata: {prefix, environment: input.environment, scopes: input.scopes},
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: input.organizationId,
          userId: input.createdByUserId || null,
          eventType: 'api_key.created',
          metadata: {api_key_id: r.rows[0].id, prefix, environment: input.environment},
        },
        client,
      );
      return {
        ...r.rows[0],
        secret, // returned once
      };
    });
  },

  async list(organizationId: string) {
    const r = await pgQuery(
      `SELECT id, organization_id, name, key_prefix, environment, scopes, status, expires_at,
              last_used_at, revoked_at, created_at
       FROM api_keys
       WHERE organization_id=$1
       ORDER BY created_at DESC`,
      [organizationId],
    );
    return r.rows;
  },

  async revoke(input: {organizationId: string; apiKeyId: string; actorUserId?: string | null; requestId?: string}) {
    return withPgTransaction(async (client) => {
      const r = await client.query(
        `UPDATE api_keys
         SET status='REVOKED', revoked_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'
         RETURNING id, key_prefix`,
        [input.apiKeyId, input.organizationId],
      );
      if (!r.rows[0]) throw new AppError('API_KEY_NOT_FOUND', 'API key not found or already revoked', 404);
      await writeAuditEvent(
        {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId || null,
          action: 'api_key.revoked',
          resourceType: 'api_key',
          resourceId: r.rows[0].id,
          requestId: input.requestId,
        },
        client,
      );
      await writeSecurityEvent(
        {
          organizationId: input.organizationId,
          userId: input.actorUserId || null,
          eventType: 'api_key.revoked',
          metadata: {api_key_id: r.rows[0].id, prefix: r.rows[0].key_prefix},
        },
        client,
      );
      return {id: r.rows[0].id, status: 'REVOKED'};
    });
  },

  async resolveSecret(secret: string): Promise<ApiKeyAuth> {
    const trimmed = secret.trim();
    if (!trimmed.startsWith('pk_test_') && !trimmed.startsWith('pk_live_')) {
      throw unauthorized('Invalid API key', 'API_KEY_INVALID');
    }
    const keyHash = hashKey(trimmed);
    const r = await pgQuery(
      `SELECT id, organization_id, environment, scopes, status, expires_at
       FROM api_keys WHERE key_hash=$1`,
      [keyHash],
    );
    const row = r.rows[0];
    if (!row) throw unauthorized('Invalid API key', 'API_KEY_INVALID');
    if (row.status === 'REVOKED') throw unauthorized('API key revoked', 'API_KEY_REVOKED');
    if (row.status !== 'ACTIVE') throw unauthorized('API key not active', 'API_KEY_INACTIVE');
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await pgQuery(`UPDATE api_keys SET status='EXPIRED', updated_at=NOW() WHERE id=$1`, [row.id]);
      throw unauthorized('API key expired', 'API_KEY_EXPIRED');
    }
    // Environment prefix must match stored environment
    const prefixEnv = trimmed.startsWith('pk_live_') ? 'LIVE' : 'SANDBOX';
    if (prefixEnv !== row.environment) {
      throw unauthorized('API key environment mismatch', 'API_KEY_ENV_MISMATCH');
    }

    await pgQuery(`UPDATE api_keys SET last_used_at=NOW(), updated_at=NOW() WHERE id=$1`, [row.id]);

    const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : [];
    return {
      apiKeyId: row.id,
      organizationId: row.organization_id,
      environment: row.environment,
      scopes,
      permissions: scopesToPermissions(scopes),
    };
  },
};

export function extractApiKey(header?: string, xApiKey?: string): string | null {
  if (xApiKey && xApiKey.trim()) return xApiKey.trim();
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() === 'api-key' || scheme.toLowerCase() === 'apikey') return token.trim();
  return null;
}
