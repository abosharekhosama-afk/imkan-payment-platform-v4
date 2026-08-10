import fs from 'node:fs';
import path from 'node:path';
import {
  SecretBackendNotConfiguredError,
  SecretNotFoundError,
  type SecretResolveInput,
  type SecretResolveResult,
  type SecretResolver,
} from './types.js';

type FileVaultEntry = {
  value: string;
  version?: string;
  purpose?: string;
  rotated_at?: string;
};

type FileVault = {
  secrets: Record<string, FileVaultEntry>;
};

/**
 * Local encrypted-at-rest file vault (dev/staging). Production should use KMS.
 * File is JSON keyed by secret_ref. Path from SECRET_FILE_PATH.
 * Values must never be committed — .gitignore the vault file.
 */
export class FileSecretResolver implements SecretResolver {
  readonly kind = 'file' as const;

  constructor(private readonly filePath: string) {}

  private load(): FileVault {
    if (!fs.existsSync(this.filePath)) {
      throw new SecretBackendNotConfiguredError(`Secret file not found: ${this.filePath}`);
    }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as FileVault;
    if (!parsed || typeof parsed.secrets !== 'object') {
      throw new SecretBackendNotConfiguredError('Secret file malformed: expected { secrets: {} }');
    }
    return parsed;
  }

  async resolve(input: SecretResolveInput): Promise<SecretResolveResult> {
    const vault = this.load();
    const entry = vault.secrets[input.secretRef];
    if (!entry?.value) throw new SecretNotFoundError(input.secretRef);
    return {
      value: entry.value,
      backend: 'file',
      secretRef: input.secretRef,
      version: input.version || entry.version || null,
    };
  }

  async rotate(input: {secretRef: string; newVersion?: string}) {
    const vault = this.load();
    const entry = vault.secrets[input.secretRef];
    if (!entry) throw new SecretNotFoundError(input.secretRef);
    const version = input.newVersion || `v${Date.now()}`;
    entry.version = version;
    entry.rotated_at = new Date().toISOString();
    fs.mkdirSync(path.dirname(this.filePath), {recursive: true});
    fs.writeFileSync(this.filePath, JSON.stringify(vault, null, 2), {encoding: 'utf8', mode: 0o600});
    return {secretRef: input.secretRef, version};
  }
}
