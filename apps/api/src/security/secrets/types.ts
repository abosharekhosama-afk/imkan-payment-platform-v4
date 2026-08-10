/**
 * Production-safe secrets architecture (P15.2).
 * Secrets are never stored in PostgreSQL plaintext, frontend, or logs.
 * Resolvers return values by secret_ref; backends: env | file | kms (stub until vendor wired).
 */
export type SecretPurpose =
  | 'provider_api_key'
  | 'webhook_secret'
  | 'bank_payout_credential'
  | 'oauth_client_secret'
  | 'encryption_key'
  | 'other';

export type SecretBackendKind = 'env' | 'file' | 'kms';

export type SecretResolveInput = {
  secretRef: string;
  purpose?: SecretPurpose;
  organizationId?: string | null;
  version?: string | null;
};

export type SecretResolveResult = {
  value: string;
  backend: SecretBackendKind;
  secretRef: string;
  version: string | null;
};

export interface SecretResolver {
  readonly kind: SecretBackendKind;
  resolve(input: SecretResolveInput): Promise<SecretResolveResult>;
  /** Optional: rotate / bump version metadata (does not invent credentials). */
  rotate?(input: {secretRef: string; newVersion?: string}): Promise<{secretRef: string; version: string}>;
}

export class SecretNotFoundError extends Error {
  code = 'SECRET_NOT_FOUND';
  constructor(secretRef: string) {
    super(`Secret not found for ref: ${secretRef}`);
    this.name = 'SecretNotFoundError';
  }
}

export class SecretBackendNotConfiguredError extends Error {
  code = 'SECRET_BACKEND_NOT_CONFIGURED';
  constructor(message: string) {
    super(message);
    this.name = 'SecretBackendNotConfiguredError';
  }
}

/** Never log secret values — use this for safe diagnostics. */
export function redactSecretRef(secretRef: string): string {
  if (!secretRef) return '[empty]';
  if (secretRef.length <= 8) return '***';
  return `${secretRef.slice(0, 4)}…${secretRef.slice(-2)}`;
}
