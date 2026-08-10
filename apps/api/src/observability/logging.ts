/**
 * Structured logging helpers with correlation / request IDs (P15.2).
 */
export type LogFields = Record<string, unknown>;

const SECRET_KEY = /password|secret|token|authorization|api[-_]?key|client[-_]?secret|cvv|cvc|pan|card/i;

export function sanitizeLogFields(fields: LogFields, depth = 0): LogFields {
  if (depth > 5) return {truncated: true};
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_KEY.test(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)) {
      out[k] = sanitizeLogFields(v as LogFields, depth + 1);
    } else if (v instanceof Error) {
      out[k] = {name: v.name, message: v.message};
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function correlationFields(input: {
  requestId?: string;
  organizationId?: string | null;
  userId?: string | null;
  paymentIntentId?: string | null;
  provider?: string | null;
}): LogFields {
  return sanitizeLogFields({
    request_id: input.requestId,
    organization_id: input.organizationId || undefined,
    user_id: input.userId || undefined,
    payment_intent_id: input.paymentIntentId || undefined,
    provider: input.provider || undefined,
  });
}
