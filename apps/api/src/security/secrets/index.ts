import {config} from '../../config.js';
import {EnvSecretResolver} from './env-resolver.js';
import {FileSecretResolver} from './file-resolver.js';
import {KmsSecretResolver} from './kms-resolver.js';
import type {SecretBackendKind, SecretResolveInput, SecretResolveResult, SecretResolver} from './types.js';
import {SecretBackendNotConfiguredError} from './types.js';

let active: SecretResolver | null = null;

export function resolveSecretBackendKind(): SecretBackendKind {
  const explicit = (process.env.SECRET_BACKEND || '').toLowerCase().trim() as SecretBackendKind | '';
  if (explicit === 'env' || explicit === 'file' || explicit === 'kms') return explicit;
  // Production prefers kms declaration when set, else env (until vendor wired).
  if (config.isProduction && process.env.KMS_PROVIDER) return 'kms';
  return 'env';
}

export function createSecretResolver(kind = resolveSecretBackendKind()): SecretResolver {
  if (kind === 'file') {
    const filePath = process.env.SECRET_FILE_PATH;
    if (!filePath) {
      throw new SecretBackendNotConfiguredError('SECRET_BACKEND=file requires SECRET_FILE_PATH');
    }
    return new FileSecretResolver(filePath);
  }
  if (kind === 'kms') {
    return new KmsSecretResolver({
      provider: process.env.KMS_PROVIDER || process.env.SECRET_KMS_PROVIDER,
      region: process.env.KMS_REGION,
    });
  }
  return new EnvSecretResolver();
}

export function getSecretResolver(): SecretResolver {
  if (!active) active = createSecretResolver();
  return active;
}

export function setSecretResolver(resolver: SecretResolver | null) {
  active = resolver;
}

export async function resolveSecret(input: SecretResolveInput): Promise<SecretResolveResult> {
  return getSecretResolver().resolve(input);
}

/** Convenience for provider_credentials_metadata.secret_ref lookups. */
export async function resolveSecretRef(secretRef: string, purpose?: SecretResolveInput['purpose']) {
  return resolveSecret({secretRef, purpose});
}
