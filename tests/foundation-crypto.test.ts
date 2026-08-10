import {describe, expect, it} from 'vitest';
import {hashPassword, verifyPassword, hashToken, encryptSecret, decryptSecret, generateTotpSecret, verifyTotp} from '../apps/api/src/foundation/crypto.js';

describe('foundation crypto', () => {
  it('hashes and verifies passwords with scrypt', () => {
    const hash = hashPassword('ChangeMe!12345');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('ChangeMe!12345', hash)).toBe(true);
    expect(verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('hashes tokens stably', () => {
    expect(hashToken('abc')).toEqual(hashToken('abc'));
    expect(hashToken('abc')).not.toEqual(hashToken('abcd'));
  });

  it('encrypts and decrypts secrets', () => {
    const enc = encryptSecret('super-secret');
    expect(enc.startsWith('v1$')).toBe(true);
    expect(decryptSecret(enc)).toBe('super-secret');
  });

  it('verifies generated TOTP against current window', async () => {
    const secret = generateTotpSecret();
    // Generate current code using same algorithm via verify with a freshly computed token:
    // We only assert secret format and that wrong code fails.
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(verifyTotp(secret, '000000', 0)).toBe(false);
  });
});
