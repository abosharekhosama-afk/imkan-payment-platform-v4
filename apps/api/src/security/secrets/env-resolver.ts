import {
  SecretNotFoundError,
  type SecretResolveInput,
  type SecretResolveResult,
  type SecretResolver,
} from './types.js';

/**
 * Env-backed resolver: secret_ref maps to process.env[secret_ref] (or mapped alias).
 * Used for local/dev and as the bootstrap path before KMS is provisioned.
 */
export class EnvSecretResolver implements SecretResolver {
  readonly kind = 'env' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  async resolve(input: SecretResolveInput): Promise<SecretResolveResult> {
    const ref = input.secretRef.trim();
    if (!ref || !/^[A-Z][A-Z0-9_]*$/.test(ref)) {
      throw new SecretNotFoundError(ref || '(empty)');
    }
    const value = this.env[ref];
    if (!value || value.length === 0) {
      throw new SecretNotFoundError(ref);
    }
    const version = input.version || this.env[`${ref}_VERSION`] || null;
    return {value, backend: 'env', secretRef: ref, version};
  }

  async rotate(input: {secretRef: string; newVersion?: string}) {
    // Env rotation is operational (replace env / redeploy). We only record version hint.
    const version = input.newVersion || `v${Date.now()}`;
    return {secretRef: input.secretRef, version};
  }
}
