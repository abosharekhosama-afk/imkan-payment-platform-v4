const REDACT = /password|secret|token|authorization|api[-_]?key|client[-_]?secret|refresh[-_]?token|access[-_]?token|cvv|cvc|card[-_]?number|\bpan\b|provider[-_]?token|mfa_token|step_up|iban|account[-_]?number|account[-_]?value|identification[-_]?number|swift|routing[-_]?number|fingerprint|payment[-_]?method[-_]?token/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 12000 ? `${value.slice(0, 12000)}…[TRUNCATED]` : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
