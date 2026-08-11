import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {Locale, translate} from './messages/index';
import type {MessageKey} from './messages/en';
import {applyTheme, readTheme, type ThemeMode} from '../theme';

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  t: (key: MessageKey | string, params?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
};

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_KEY = 'v4_lang';

function readLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_KEY);
  return stored === 'ar' ? 'ar' : 'en';
}

export function I18nProvider({children}: {children: React.ReactNode}) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      theme,
      setTheme: setThemeState,
      t: (key, params) => translate(key, locale, params),
      dir: locale === 'ar' ? 'rtl' : 'ltr',
    }),
    [locale, theme],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

/** Apply saved locale/theme before React mounts (called from main entry). */
export function bootstrapPreferences() {
  const locale = readLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  applyTheme(readTheme());
}
