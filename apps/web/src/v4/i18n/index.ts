export type Locale = 'en' | 'ar';
export {I18nProvider, useI18n, bootstrapPreferences} from './I18nProvider';
export {translate, en, ar} from './messages/index';
export type {MessageKey} from './messages/en';

import {translate} from './messages/index';

/** @deprecated Use useI18n().t() instead */
export function t(key: string, locale: Locale = 'en'): string {
  return translate(key, locale);
}
