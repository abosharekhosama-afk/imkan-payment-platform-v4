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
        'SECRET_BACKEND=kms requires KMS_PROVIDER (aws|gcp|azure) and a wired SDK. Architecture ready; vendor not connected in P15.2.',
      );
    }

    throw new SecretBackendNotConfiguredError(
      `KMS provider "${provider}" is declared but the vendor SDK is not wired in P15.2. Set SECRET_BACKEND=env|file until P15.3/P15.4 connects KMS.`,
    );
  }

  async rotate(input: {secretRef: string; newVersion?: string}): Promise<{secretRef: string; version: string}> {
    throw new SecretBackendNotConfiguredError(
      `KMS rotation for ${input.secretRef} requires a wired vendor SDK (not in P15.2).`,
    );
  }
}
