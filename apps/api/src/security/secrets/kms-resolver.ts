import {
  SecretBackendNotConfiguredError,
  type SecretResolveInput,
  type SecretResolveResult,
  type SecretResolver,
} from './types.js';

/**
 * KMS / cloud secret-manager adapter (P15.2 architecture only).
 * Does NOT invent credentials or call a vendor until KMS_* is configured.
 * P15.3+ will plug AWS Secrets Manager / GCP Secret Manager / Azure Key Vault here.
 */
export class KmsSecretResolver implements SecretResolver {
  readonly kind = 'kms' as const;

  constructor(
    private readonly opts: {
      provider?: string;
      region?: string;
      /** Optional injected fetch for tests / future SDK wrap */
      fetchSecret?: (ref: string, version?: string | null) => Promise<{value: string; version: string | null}>;
    } = {},
  ) {}

  async resolve(input: SecretResolveInput): Promise<SecretResolveResult> {
    if (this.opts.fetchSecret) {
      const got = await this.opts.fetchSecret(input.secretRef, input.version);
      return {
        value: got.value,
        backend: 'kms',
        secretRef: input.secretRef,
        version: got.version,
      };
    }

    const provider = this.opts.provider || process.env.KMS_PROVIDER || process.env.SECRET_KMS_PROVIDER;
    if (!provider) {
      throw new SecretBackendNotConfiguredError(
        'SECRET_BACKEND=kms requires KMS_PROVIDER (env|render|aws|gcp|azure).',
      );
    }

    if (provider === 'env' || provider === 'render') {
      const value = process.env[input.secretRef];
      if (!value) {
        throw new SecretBackendNotConfiguredError(`KMS env mapping missing process.env.${input.secretRef}`);
      }
      return {
        value,
        backend: 'kms',
        secretRef: input.secretRef,
        version: input.version || 'env',
      };
    }

    throw new SecretBackendNotConfiguredError(
      `KMS provider "${provider}" requires a vendor SDK. Use KMS_PROVIDER=env|render until AWS/GCP/Azure is wired.`,
    );
  }

  async rotate(input: {secretRef: string; newVersion?: string}): Promise<{secretRef: string; version: string}> {
    throw new SecretBackendNotConfiguredError(
      `KMS rotation for ${input.secretRef} requires a wired vendor SDK (not in P15.2).`,
    );
  }
}
