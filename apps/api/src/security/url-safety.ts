/**
 * URL safety for success/cancel/callback URLs (open-redirect / SSRF hygiene).
 * Blocks localhost, private networks, link-local, metadata hosts, and non-http(s).
 */
import {AppError} from '../foundation/errors.js';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

function isPrivateOrLocalIp(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function assertSafePublicUrl(raw: string | null | undefined, field = 'url'): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const value = String(raw).trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError('UNSAFE_URL', `${field} is not a valid URL`, 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError('UNSAFE_URL', `${field} must use http or https`, 400);
  }
  // Prefer https for production callbacks; allow http only for non-production local merchant sites is still blocked for private hosts.
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || isPrivateOrLocalIp(host)) {
    throw new AppError('UNSAFE_URL', `${field} must not target private or local networks`, 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError('UNSAFE_URL', `${field} must not include credentials`, 400);
  }
  return parsed.toString();
}
