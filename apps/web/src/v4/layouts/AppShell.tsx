import React, {useEffect, useMemo, useState} from 'react';
import {NavLink, Outlet, useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {Button} from '../design-system/components';
import {NAV_SECTIONS, type NavSection} from './nav';
import {useI18n} from '../i18n/I18nProvider';

const NAV_COLLAPSED_KEY = 'v4-nav-collapsed';

function sectionContainsPath(section: NavSection, pathname: string) {
  return section.items.some((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}

export function AppShell() {
  const {user, roles, logout, hasPermission, isPlatform} = useAuth();
  const {t, locale, setLocale, theme, setTheme, dir} = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NAV_COLLAPSED_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const isVisibleForAccount = (to: string) =>
    !isPlatform || to.startsWith('/platform') || to === '/settings/appearance';

  const visibleSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        section,
        items: section.items.filter(
          (item) => isVisibleForAccount(item.to) && (!item.anyOf || hasPermission(...item.anyOf)),
        ),
      })).filter((s) => s.items.length > 0),
    [hasPermission, isPlatform],
  );

  useEffect(() => {
    const active = visibleSections.find(({section}) => sectionContainsPath(section, location.pathname));
    if (!active) return;
    setCollapsed((prev) => {
      if (prev[active.section.labelKey] === false) return prev;
      return {...prev, [active.section.labelKey]: false};
    });
  }, [location.pathname, visibleSections]);

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const toggleSection = (labelKey: string) => {
    setCollapsed((prev) => ({...prev, [labelKey]: !prev[labelKey]}));
  };

  return (
    <div className="v4-shell" dir={dir}>
      {open ? (
        <button
          type="button"
          className="v4-sidebar-backdrop"
          aria-label={t('app.closeMenu')}
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside className={`v4-sidebar ${open ? 'open' : ''}`} aria-label={t('app.mainNav')}>
        <div className="v4-brand">
          <div className="v4-brand-mark">IMK</div>
          <div>
            <h1>{t('app.name')}</h1>
            <p>{t('app.console')}</p>
          </div>
        </div>
        <div className="v4-env-pill" title={t('app.railTitle')}>
          ● {t('env.sandbox')}
        </div>
        <nav className="v4-sidebar-nav">
          {visibleSections.map(({section, items}) => {
            const isCollapsed = collapsed[section.labelKey] ?? true;
            const isActiveSection = sectionContainsPath(section, location.pathname);
            return (
              <div
                className={`v4-nav-section${isActiveSection ? ' is-active-group' : ''}${isCollapsed ? ' is-collapsed' : ''}`}
                key={section.labelKey}
              >
                <button
                  type="button"
                  className="v4-nav-section-toggle"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleSection(section.labelKey)}
                >
                  <span className="v4-nav-label">{t(section.labelKey)}</span>
                  <span className="v4-nav-chevron" aria-hidden="true" />
                </button>
                <div className="v4-nav-section-items">
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
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="v4-main">
        <header className="v4-topbar">
          <div className="v4-toolbar v4-topbar-start">
            <Button className="v4-mobile-toggle" variant="secondary" type="button" onClick={() => setOpen((v) => !v)}>
              {t('app.menu')}
            </Button>
            <strong className="v4-topbar-title">{t('app.consoleShort')}</strong>
          </div>
          <div className="v4-toolbar v4-topbar-end">
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
            <span className="v4-topbar-user">
              {user?.email}
              {(roles || []).length ? ` · ${(roles || []).join(', ')}` : ''}
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
