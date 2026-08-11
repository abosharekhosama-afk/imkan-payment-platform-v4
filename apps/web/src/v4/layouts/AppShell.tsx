import React, {useState} from 'react';
import {NavLink, Outlet} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {Button} from '../design-system/components';
import {NAV_SECTIONS} from './nav';
import {usePlatformRuntime} from '../hooks/usePlatformRuntime';
import {useI18n} from '../i18n/I18nProvider';

export function AppShell() {
  const {user, roles, logout, hasPermission} = useAuth();
  const {runtime} = usePlatformRuntime();
  const {t, locale, setLocale, theme, setTheme} = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="v4-shell">
      <aside className={`v4-sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="v4-brand">
          <div className="v4-brand-mark">V4</div>
          <div>
            <h1>{t('app.name')}</h1>
            <p>{t('app.console')}</p>
          </div>
        </div>
        <div className="v4-env-pill" title={t('app.railTitle')}>
          ● {runtime.labels.console_rail}
        </div>
        <nav>
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !item.anyOf || hasPermission(...item.anyOf));
            if (!items.length) return null;
            return (
              <div className="v4-nav-section" key={section.labelKey}>
                <div className="v4-nav-label">{t(section.labelKey)}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({isActive}) => `v4-nav-link${isActive ? ' active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    {t(item.labelKey)}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="v4-main">
        <header className="v4-topbar">
          <div className="v4-toolbar" style={{margin: 0}}>
            <Button className="v4-mobile-toggle" variant="secondary" type="button" onClick={() => setOpen((v) => !v)}>
              {t('app.menu')}
            </Button>
            <strong style={{fontFamily: 'var(--v4-font-display)'}}>{t('app.consoleShort')}</strong>
          </div>
          <div className="v4-toolbar" style={{margin: 0}}>
            <select
              className="v4-pref-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as 'en' | 'ar')}
              aria-label={t('settings.appearance.language')}
            >
              <option value="en">{t('settings.appearance.langEn')}</option>
              <option value="ar">{t('settings.appearance.langAr')}</option>
            </select>
            <select
              className="v4-pref-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
              aria-label={t('settings.appearance.theme')}
            >
              <option value="light">{t('settings.appearance.themeLight')}</option>
              <option value="dark">{t('settings.appearance.themeDark')}</option>
            </select>
            <span style={{color: 'var(--v4-text-muted)', fontSize: '0.9rem'}}>
              {user?.email} · {(roles || []).join(', ') || t('app.session')}
            </span>
            <Button variant="secondary" type="button" onClick={() => void logout()}>
              {t('app.logout')}
            </Button>
          </div>
        </header>
        <main className="v4-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
