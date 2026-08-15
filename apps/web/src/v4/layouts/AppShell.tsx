import React, {useEffect, useMemo, useState} from 'react';
import {NavLink, Outlet, useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {NAV_SECTIONS} from './nav';
import {NavIcon} from './NavIcon';
import {useI18n} from '../i18n/I18nProvider';
import {formatRole} from '../i18n/humanize';

export function AppShell() {
  const {user, roles, logout, hasPermission, isPlatform} = useAuth();
  const {t, locale, dir} = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const isVisibleForAccount = (to: string) =>
    !isPlatform || to.startsWith('/platform') || to === '/settings/appearance';

  const visibleSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items
          .map((item) =>
            isPlatform && item.to === '/settings/organization'
              ? {...item, to: '/settings/appearance', anyOf: undefined}
              : item,
          )
          .filter((item) => isVisibleForAccount(item.to) && (!item.anyOf || hasPermission(...item.anyOf))),
      })).filter((section) => section.items.length > 0),
    [hasPermission, isPlatform],
  );

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const primaryRole = formatRole(roles?.[0], locale);
  const initials = (user?.email || 'U').slice(0, 2).toUpperCase();

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
        <nav className="v4-sidebar-nav">
          {visibleSections.map((section) => (
            <div key={section.labelKey}>
              <div className="v4-nav-section-label">{t(section.labelKey)}</div>
              {section.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({isActive}) => `v4-nav-link${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <NavIcon name={item.icon} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="v4-sidebar-footer">
          <div className="v4-sidebar-user">
            <div className="v4-avatar" aria-hidden="true">
              {initials}
            </div>
            <div className="v4-sidebar-user-meta">
              <strong>{user?.email || t('app.session')}</strong>
              <small>{primaryRole}</small>
            </div>
          </div>
          <button type="button" className="v4-sidebar-logout" onClick={() => void logout()}>
            {t('app.logout')}
          </button>
        </div>
      </aside>
      <div className="v4-main">
        <header className="v4-topbar">
          <button
            type="button"
            className="v4-icon-btn v4-mobile-toggle"
            aria-label={open ? t('app.closeMenu') : t('app.menu')}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`v4-hamburger${open ? ' is-open' : ''}`} aria-hidden="true" />
          </button>
          <strong className="v4-topbar-title">{t('app.name')}</strong>
        </header>
        <main className="v4-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
