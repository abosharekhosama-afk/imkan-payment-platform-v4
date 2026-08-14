import type {Locale} from './index';
import {translate} from './messages/index';

function titleCase(value: string): string {
  return value
    .replace(/[_.-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function lookup(key: string, locale: Locale): string | null {
  const label = translate(key, locale);
  return label === key ? null : label;
}

/** MERCHANT_OWNER → "Owner" / "المالك" */
export function formatRole(code: string | null | undefined, locale: Locale = 'en'): string {
  if (!code) return '—';
  return lookup(`role.${code}`, locale) || titleCase(code.replace(/^MERCHANT_|^PLATFORM_/, ''));
}

export function formatRoles(codes: string[] | string | null | undefined, locale: Locale = 'en'): string {
  if (!codes) return '—';
  const list = Array.isArray(codes) ? codes : [codes];
  if (!list.length) return '—';
  return list.map((c) => formatRole(c, locale)).join(locale === 'ar' ? '، ' : ', ');
}

/** REQUIRES_PAYMENT → "Waiting for payment" */
export function formatStatus(status: string | null | undefined, locale: Locale = 'en'): string {
  if (!status) return '—';
  const key = String(status).trim();
  return lookup(`status.${key}`, locale) || lookup(`status.${key.toUpperCase()}`, locale) || titleCase(key);
}

/** payments.read → "View payments" */
export function formatPermission(code: string | null | undefined, locale: Locale = 'en'): string {
  if (!code) return '—';
  const named = lookup(`perm.${code}`, locale);
  if (named) return named;
  const [resource, action, ...rest] = code.split('.');
  if (!action) return titleCase(code);
  const verb = lookup(`permVerb.${action}`, locale) || titleCase(action);
  const noun = lookup(`permNoun.${[resource, ...rest].join('.')}`, locale) || lookup(`permNoun.${resource}`, locale) || titleCase(resource.replace(/_/g, ' '));
  return locale === 'ar' ? `${verb} ${noun}` : `${verb} ${noun}`.replace(/\s+/g, ' ').trim();
}

/** History / API reason strings such as "Awaiting payment method" */
export function formatReason(reason: string | null | undefined, locale: Locale = 'en'): string {
  if (!reason) return '—';
  const slug = reason.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return lookup(`reason.${slug}`, locale) || reason;
}

/** invitation.created / bank_account.activate → readable label */
export function formatEventAction(code: string | null | undefined, locale: Locale = 'en'): string {
  if (!code) return '—';
  const key = String(code).trim();
  return lookup(`event.${key}`, locale) || titleCase(key);
}

/** Convert API / stored error text into a merchant-facing sentence. */
export function formatErrorMessage(
  message: string | null | undefined,
  code?: string | null,
  locale: Locale = 'en',
): string {
  const namedCode = code ? lookup(`error.${code}`, locale) : null;
  const raw = String(message || '').trim();
  if (!raw && namedCode) return namedCode;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(raw)) {
    return lookup(`error.${raw}`, locale) || namedCode || titleCase(raw);
  }

  const parts = raw
    .split(/\s*\|\s*/)
    .map((part) => humanizeErrorPart(part, locale))
    .filter(Boolean);
  const joined = parts.join(locale === 'ar' ? ' ' : ' ');
  if (joined) return joined;
  return namedCode || lookup('error.INTERNAL_ERROR', locale) || raw || '—';
}

export function formatErrorCode(code: string | null | undefined, locale: Locale = 'en'): string {
  if (!code) return '—';
  const key = String(code).trim();
  if (/^\d+$/.test(key)) return key;
  return lookup(`errorType.${key}`, locale) || lookup(`error.${key}`, locale) || titleCase(key);
}

function humanizeErrorPart(part: string, locale: Locale): string {
  const text = part.trim();
  if (!text) return '';
  const looked = lookup(`error.${text}`, locale);
  if (looked) return looked;
  if (/authenticator code must be 6 digits/i.test(text)) {
    return lookup('error.TOTP_FORMAT', locale) || text;
  }
  if (/something went wrong/i.test(text)) {
    return lookup('error.INTERNAL_ERROR', locale) || text;
  }
  if (/some (details|fields) are invalid/i.test(text)) {
    return lookup('error.VALIDATION_ERROR', locale) || text;
  }

  const fieldMatch = text.match(/^([a-zA-Z0-9_.]+):\s*(.*)$/);
  const field = fieldMatch?.[1] || '';
  const rest = fieldMatch?.[2] || text;
  const fieldKey = field.split('.').pop() || field;
  const fieldLabel = lookup(`errorField.${fieldKey}`, locale) || (fieldKey ? titleCase(fieldKey) : '');

  if (/totp/i.test(field) || /totp/i.test(text)) {
    return lookup('error.TOTP_FORMAT', locale) || text;
  }
  if (/must match pattern|regex|\\d\{6\}|\/\^/i.test(rest) || /must match pattern|regex|\\d\{6\}|\/\^/i.test(text)) {
    return fieldLabel
      ? locale === 'ar'
        ? `${fieldLabel} بصيغة غير صحيحة.`
        : `${fieldLabel} is not in the correct format.`
      : lookup('error.INVALID_FORMAT', locale) || text;
  }
  if (/invalid uuid|uuid/i.test(rest)) {
    return lookup('error.INVALID_ID', locale) || text;
  }
  if (/required|expected string|invalid_type/i.test(rest)) {
    return fieldLabel
      ? locale === 'ar'
        ? `${fieldLabel} مطلوب.`
        : `${fieldLabel} is required.`
      : lookup('error.VALIDATION_ERROR', locale) || text;
  }
  if (/internal error|internal_error/i.test(text)) {
    return lookup('error.INTERNAL_ERROR', locale) || text;
  }
  return text;
}

export function formatActor(
  row: {
    actor_name?: string | null;
    actor_email?: string | null;
    user_name?: string | null;
    user_email?: string | null;
    name?: string | null;
    email?: string | null;
  } | null | undefined,
): string {
  if (!row) return '—';
  const name = row.actor_name || row.user_name || row.name;
  const email = row.actor_email || row.user_email || row.email;
  if (name && email && name !== email) return `${name} · ${email}`;
  if (name) return name;
  if (email) return email;
  return '—';
}
