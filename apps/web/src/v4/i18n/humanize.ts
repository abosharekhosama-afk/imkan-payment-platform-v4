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
