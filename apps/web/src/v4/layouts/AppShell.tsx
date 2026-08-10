import React, {useState} from 'react';
import {NavLink, Outlet} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {Button} from '../design-system/components';
import {NAV_SECTIONS} from './nav';

export function AppShell() {
  const {user, roles, logout, hasPermission} = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="v4-shell">
      <aside className={`v4-sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="v4-brand">
          <div className="v4-brand-mark">V4</div>
          <div>
            <h1>IMKAN Payments</h1>
            <p>Merchant Console</p>
          </div>
        </div>
        <div className="v4-env-pill" title="Sandbox is the only active payment rail">
          ● SANDBOX RAIL
        </div>
        <nav>
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter((item) => !item.anyOf || hasPermission(...item.anyOf));
            if (!items.length) return null;
            return (
              <div className="v4-nav-section" key={section.label}>
                <div className="v4-nav-label">{section.label}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({isActive}) => `v4-nav-link${isActive ? ' active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
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
              Menu
            </Button>
            <strong style={{fontFamily: 'var(--v4-font-display)'}}>V4 Console</strong>
          </div>
          <div className="v4-toolbar" style={{margin: 0}}>
            <span style={{color: 'var(--v4-text-muted)', fontSize: '0.9rem'}}>
              {user?.email} · {(roles || []).join(', ') || 'session'}
            </span>
            <Button variant="secondary" type="button" onClick={() => void logout()}>
              Log out
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
