/**
 * Secret reference metadata service (P15.2).
 * Stores refs only — never secret values.
 */
import {pgQuery} from '../../infrastructure/db/postgres.js';
import {resolveSecretRef} from './index.js';
import type {SecretPurpose, SecretBackendKind} from './types.js';
import {redactSecretRef} from './types.js';

export async function upsertSecretReference(input: {
  organizationId?: string | null;
  purpose: SecretPurpose;
  secretRef: string;
  backend?: SecretBackendKind;
  version?: string | null;
  providerCode?: string | null;
  environment?: 'SANDBOX' | 'LIVE' | null;
  metadata?: Record<string, unknown>;
}) {
  const orgId = input.organizationId || null;
  const existing = orgId
    ? await pgQuery<{id: string}>(
        `SELECT id FROM secret_references WHERE organization_id=$1 AND purpose=$2 AND secret_ref=$3`,
        [orgId, input.purpose, input.secretRef],
      )
    : await pgQuery<{id: string}>(
        `SELECT id FROM secret_references WHERE organization_id IS NULL AND purpose=$1 AND secret_ref=$2`,
        [input.purpose, input.secretRef],
      );

  if (existing.rows[0]) {
    await pgQuery(
      `UPDATE secret_references SET
         backend=$2,
         version=COALESCE($3, version),
         provider_code=COALESCE($4, provider_code),
         environment=COALESCE($5, environment),
         metadata=$6::jsonb,
         updated_at=NOW()
       WHERE id=$1`,
      [
        existing.rows[0].id,
        input.backend || 'env',
        input.version || null,
        input.providerCode || null,
        input.environment || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
    return {id: existing.rows[0].id, secret_ref: redactSecretRef(input.secretRef)};
  }

  const r = await pgQuery<{id: string}>(
    `INSERT INTO secret_references (
       organization_id, purpose, secret_ref, backend, version, provider_code, environment, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id`,
    [
      orgId,
      input.purpose,
      input.secretRef,
      input.backend || 'env',
      input.version || null,
      input.providerCode || null,
      input.environment || null,
      JSON.stringify(input.metadata || {}),
    ],
  );
  return {id: r.rows[0].id, secret_ref: redactSecretRef(input.secretRef)};
}

export async function markSecretRotated(secretRef: string, version: string) {
  await pgQuery(
    `UPDATE secret_references SET version=$2, rotated_at=NOW(), updated_at=NOW() WHERE secret_ref=$1`,
    [secretRef, version],
  );
}

/** Resolve + verify the backend has the secret (value never returned to list APIs). */
export async function assertSecretResolvable(secretRef: string, purpose?: SecretPurpose) {
  const resolved = await resolveSecretRef(secretRef, purpose);
  return {
    secret_ref: redactSecretRef(secretRef),
    backend: resolved.backend,
    version: resolved.version,
    resolvable: true,
  };
}

export async function listSecretReferences(organizationId: string | null) {
  const r = await pgQuery<{
    id: string;
    purpose: string;
    secret_ref: string;
    backend: string;
    version: string | null;
    provider_code: string | null;
    environment: string | null;
    rotated_at: Date | null;
    updated_at: Date;
  }>(
    `SELECT id, purpose, secret_ref, backend, version, provider_code, environment, rotated_at, updated_at
     FROM secret_references
     WHERE ($1::uuid IS NULL AND organization_id IS NULL) OR organization_id = $1
     ORDER BY updated_at DESC`,
    [organizationId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    secret_ref: row.secret_ref,
    secret_ref_redacted: redactSecretRef(row.secret_ref),
    backend: row.backend,
    version: row.version,
    provider_code: row.provider_code,
    environment: row.environment,
    rotated_at: row.rotated_at,
    updated_at: row.updated_at,
  }));
}
