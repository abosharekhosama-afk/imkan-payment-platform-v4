import {describe, expect, it} from 'vitest';
import {
  bankAccountFingerprint,
  decryptBankSecret,
  encryptBankSecret,
  identificationFingerprint,
  maskTail,
  normalizeBankAccountValue,
} from '../apps/api/src/foundation/crypto.js';
import {redact} from '../apps/api/src/foundation/redact.js';

describe('phase 3 bank data crypto (unit)', () => {
  it('normalizes equivalent IBAN representations identically', () => {
    const a = normalizeBankAccountValue('IBAN', 'SA03 8000 0000 6080 1016 7519');
    const b = normalizeBankAccountValue('IBAN', 'sa0380000000608010167519');
    expect(a).toBe(b);
    expect(a).toBe('SA0380000000608010167519');
  });

  it('rejects structurally invalid IBANs', () => {
    expect(() => normalizeBankAccountValue('IBAN', 'NOT-AN-IBAN')).toThrow();
    expect(() => normalizeBankAccountValue('IBAN', '1234567890')).toThrow();
  });

  it('normalizes account numbers conservatively (whitespace/hyphens only)', () => {
    expect(normalizeBankAccountValue('ACCOUNT_NUMBER', '12-34 5678')).toBe('12345678');
    expect(() => normalizeBankAccountValue('ACCOUNT_NUMBER', '@@!!')).toThrow();
  });

  it('produces deterministic, type/country-namespaced fingerprints', () => {
    const v = normalizeBankAccountValue('IBAN', 'SA03 8000 0000 6080 1016 7519');
    const f1 = bankAccountFingerprint('IBAN', 'SA', v);
    const f2 = bankAccountFingerprint('IBAN', 'sa', v);
    expect(f1).toBe(f2);
    expect(f1).toMatch(/^[a-f0-9]{64}$/);
    // Different namespace (type or country) must not collide.
    expect(bankAccountFingerprint('ACCOUNT_NUMBER', 'SA', v)).not.toBe(f1);
    expect(bankAccountFingerprint('IBAN', 'AE', v)).not.toBe(f1);
  });

  it('identification fingerprints are deterministic per type', () => {
    expect(identificationFingerprint('PASSPORT', 'A 123-456')).toBe(identificationFingerprint('passport', 'a123456'));
    expect(identificationFingerprint('NATIONAL_ID', 'A123456')).not.toBe(identificationFingerprint('PASSPORT', 'A123456'));
  });

  it('bank secrets round-trip through AES-256-GCM and are never plaintext at rest', () => {
    const enc = encryptBankSecret('SA0380000000608010167519');
    expect(enc.startsWith('v1$')).toBe(true);
    expect(enc).not.toContain('6080');
    expect(decryptBankSecret(enc)).toBe('SA0380000000608010167519');
  });

  it('masks tails and redacts sensitive banking keys in logs/error payloads', () => {
    expect(maskTail('7519')).toBe('****7519');
    const redacted = redact({
      account_value: 'SA0380000000608010167519',
      iban: 'SA0380000000608010167519',
      account_number: '12345678',
      identification_number: 'A123456',
      swift_bic: 'ABCDSARI',
      note: 'safe',
    }) as Record<string, unknown>;
    expect(redacted.account_value).toBe('[REDACTED]');
    expect(redacted.iban).toBe('[REDACTED]');
    expect(redacted.account_number).toBe('[REDACTED]');
    expect(redacted.identification_number).toBe('[REDACTED]');
    expect(redacted.swift_bic).toBe('[REDACTED]');
    expect(redacted.note).toBe('safe');
  });
});
