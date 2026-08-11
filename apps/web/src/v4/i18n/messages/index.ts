import {en, type MessageKey} from './en';
import {ar} from './ar';

export type Locale = 'en' | 'ar';

export function translate(
  key: MessageKey | string,
  locale: Locale,
  params?: Record<string, string | number>,
): string {
  const base =
    locale === 'ar'
      ? ar[key] ?? en[key as MessageKey] ?? key
      : en[key as MessageKey] ?? key;

  if (!params) return base;
  return Object.entries(params).reduce(
    (text, [k, v]) => text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    base,
  );
}

export {en, ar};
