import {describe, expect, it, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EnvSecretResolver} from '../apps/api/src/security/secrets/env-resolver.js';
import {FileSecretResolver} from '../apps/api/src/security/secrets/file-resolver.js';
import {KmsSecretResolver} from '../apps/api/src/security/secrets/kms-resolver.js';
import {
  createSecretResolver,
  setSecretResolver,
  resolveSecret,
} from '../apps/api/src/security/secrets/index.js';
import {SecretBackendNotConfiguredError, SecretNotFoundError, redactSecretRef} from '../apps/api/src/security/secrets/types.js';

describe('P15.2 secrets / KMS architecture', () => {
  beforeEach(() => setSecretResolver(null));
  afterEach(() => setSecretResolver(null));

  it('EnvSecretResolver resolves by secret_ref and never invents values', async () => {
    const resolver = new EnvSecretResolver({
      SANDBOX_WEBHOOK_SECRET: 'test-secret-value',
      SANDBOX_WEBHOOK_SECRET_VERSION: 'v1',
    } as any);
    const got = await resolver.resolve({secretRef: 'SANDBOX_WEBHOOK_SECRET', purpose: 'webhook_secret'});
    expect(got.value).toBe('test-secret-value');
    expect(got.backend).toBe('env');
    expect(got.version).toBe('v1');
    await expect(resolver.resolve({secretRef: 'MISSING_SECRET'})).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  it('FileSecretResolver reads vault file without embedding secrets in code', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imkan-secrets-'));
    const filePath = path.join(dir, 'vault.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        secrets: {
          PROVIDER_API_KEY_ACME: {value: 'file-secret', version: 'v2', purpose: 'provider_api_key'},
        },
      }),
    );
    const resolver = new FileSecretResolver(filePath);
    const got = await resolver.resolve({secretRef: 'PROVIDER_API_KEY_ACME'});
    expect(got.value).toBe('file-secret');
    expect(got.version).toBe('v2');
    const rotated = await resolver.rotate({secretRef: 'PROVIDER_API_KEY_ACME', newVersion: 'v3'});
    expect(rotated.version).toBe('v3');
  });

  it('KmsSecretResolver refuses until vendor SDK is wired (architecture ready)', async () => {
    const resolver = new KmsSecretResolver({});
    await expect(resolver.resolve({secretRef: 'ANY_REF'})).rejects.toBeInstanceOf(SecretBackendNotConfiguredError);
  });

  it('KmsSecretResolver accepts injected fetch for future SDK tests', async () => {
    const resolver = new KmsSecretResolver({
      fetchSecret: async (ref) => ({value: `kms:${ref}`, version: '1'}),
    });
    const got = await resolver.resolve({secretRef: 'PAYTABS_API_KEY'});
    expect(got.value).toBe('kms:PAYTABS_API_KEY');
    expect(got.backend).toBe('kms');
  });

  it('redactSecretRef never prints full refs in logs', () => {
    expect(redactSecretRef('SANDBOX_WEBHOOK_SECRET')).toMatch(/^SAND/);
    expect(redactSecretRef('SANDBOX_WEBHOOK_SECRET')).not.toContain('WEBHOOK_SECRET');
  });

  it('createSecretResolver defaults to env backend', async () => {
    process.env.UNIT_TEST_SECRET_XYZ = 'abc';
    setSecretResolver(createSecretResolver('env'));
    const got = await resolveSecret({secretRef: 'UNIT_TEST_SECRET_XYZ'});
    expect(got.value).toBe('abc');
    delete process.env.UNIT_TEST_SECRET_XYZ;
  });
});
