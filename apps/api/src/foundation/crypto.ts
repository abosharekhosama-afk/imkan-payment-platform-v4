import crypto from 'node:crypto';
import {config} from '../config.js';

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(hashHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function deriveKey(raw: string): Buffer {
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptionKey(): Buffer {
  return deriveKey(config.paymentTokenEncryptionKey);
}

function gcmEncrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1$${iv.toString('base64url')}$${tag.toString('base64url')}$${enc.toString('base64url')}`;
}

function gcmDecrypt(payload: string, key: Buffer): string {
  const [version, ivB64, tagB64, dataB64] = payload.split('$');
  if (version !== 'v1') throw Object.assign(new Error('UNSUPPORTED_SECRET_VERSION'), {statusCode: 500, code: 'UNSUPPORTED_SECRET_VERSION'});
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
  return dec.toString('utf8');
}

export function encryptSecret(plaintext: string): string {
  return gcmEncrypt(plaintext, encryptionKey());
}

export function decryptSecret(payload: string): string {
  return gcmDecrypt(payload, encryptionKey());
}

/**
 * Phase 3: bank/identification data at rest.
 * Standard AES-256-GCM; key comes from BANK_DATA_ENCRYPTION_KEY (environment only, never PostgreSQL).
 */
export function encryptBankSecret(plaintext: string): string {
  return gcmEncrypt(plaintext, deriveKey(config.bankDataEncryptionKey));
}

export function decryptBankSecret(payload: string): string {
  return gcmDecrypt(payload, deriveKey(config.bankDataEncryptionKey));
}

export type BankAccountType = 'IBAN' | 'ACCOUNT_NUMBER';

/**
 * Normalization is per account type (no universal algorithm):
 *  - IBAN: remove all whitespace, uppercase, validate ISO 13616 structure.
 *  - ACCOUNT_NUMBER: remove whitespace and hyphens, uppercase (conservative; no lossy transforms).
 * Returns the canonical value used for fingerprinting; throws on structurally invalid IBAN.
 */
export function normalizeBankAccountValue(type: BankAccountType, raw: string): string {
  if (type === 'IBAN') {
    const v = raw.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(v)) {
      throw Object.assign(new Error('INVALID_IBAN_FORMAT'), {statusCode: 400, code: 'INVALID_IBAN_FORMAT'});
    }
    return v;
  }
  const v = raw.replace(/[\s-]+/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,34}$/.test(v)) {
    throw Object.assign(new Error('INVALID_ACCOUNT_NUMBER_FORMAT'), {statusCode: 400, code: 'INVALID_ACCOUNT_NUMBER_FORMAT'});
  }
  return v;
}

/**
 * Deterministic, non-reversible fingerprint for duplicate detection.
 * HMAC-SHA256 keyed from BANK_FINGERPRINT_HMAC_KEY (environment only, never PostgreSQL).
 * Input is namespaced by account type and country to avoid cross-domain collisions.
 * Fingerprints MUST NOT be treated as reversible secrets or exposed as account identifiers.
 */
export function bankAccountFingerprint(type: BankAccountType, countryCode: string, normalizedValue: string): string {
  return crypto
    .createHmac('sha256', deriveKey(config.bankFingerprintHmacKey))
    .update(`${type}|${countryCode.toUpperCase()}|${normalizedValue}`)
    .digest('hex');
}

/** Deterministic fingerprint for person identification numbers (duplicate detection only). */
export function identificationFingerprint(typeCode: string, value: string): string {
  const normalized = value.replace(/[\s-]+/g, '').toUpperCase();
  return crypto
    .createHmac('sha256', deriveKey(config.bankFingerprintHmacKey))
    .update(`ID|${typeCode.toUpperCase()}|${normalized}`)
    .digest('hex');
}

export function maskTail(value: string, visible = 4): string {
  const tail = value.slice(-visible);
  return `****${tail}`;
}

/** RFC 6238 TOTP (SHA1, 30s, 6 digits) — foundation only */
export function currentTotp(secretBase32: string): string {
  const secret = base32Decode(secretBase32);
  const now = Math.floor(Date.now() / 1000 / 30);
  return generateTotp(secret, now);
}

export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  const secret = base32Decode(secretBase32);
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (safeEqual(generateTotp(secret, now + w), token)) return true;
  }
  return false;
}

export function generateTotpSecret(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let secret = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      secret += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) secret += alphabet[(value << (5 - bits)) & 31];
  return secret;
}

function generateTotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
