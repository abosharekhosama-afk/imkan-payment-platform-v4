import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import type {Locale} from '../../i18n/index';
import type {ThemeMode} from '../../theme';
import {formatDate, shortId} from '../../utils/money';

export function UsersPage() {
  const {t} = useI18n();
  const {token, organizationId} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('MERCHANT_VIEWER');
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);

  const load = () => {
    if (!token || !organizationId) return;
    setLoading(true);
    Promise.all([
      v4.members(token, organizationId),
      v4.invitations(token, organizationId).catch(() => []),
    ])
      .then(([m, i]) => {
        setRows(m);
        setInvites(i);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, organizationId]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setError('');
    try {
      const result = await obtainStepUp(token, totp);
      if (result.enrolled) {
        setMfaSecretOnce(result.mfaSecret || null);
        setError(t('security.mfaEnrolled'));
        setTotp('');
        return;
      }
      await v4.createInvitation(token, organizationId, {email, role_code: roleCode}, result.stepUpToken);
      push('Invitation created');
      setEmail('');
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('security.users.title')}
        description={t('security.users.description')}
        crumbs={[{label: t('section.security')}, {label: t('nav.users')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>{t('security.users.members')}</h3>
            <DataTable
              columns={[
                t('security.users.colUser'),
                t('common.email'),
                t('security.users.colRoles'),
                t('common.status'),
              ]}
              rows={rows.map((r) => [
                shortId(r.id || r.user_id),
                r.email,
                Array.isArray(r.roles) ? r.roles.join(', ') : r.role_code || '—',
                <StatusBadge status={r.status} />,
              ])}
            />
          </div>
          <div className="v4-card">
            <h3>{t('security.users.invitations')}</h3>
            <DataTable
              columns={[
                t('security.users.colInvite'),
                t('common.email'),
                t('security.users.colRole'),
                t('common.status'),
                t('security.users.colExpires'),
              ]}
              rows={invites.map((i) => [
                shortId(i.id),
                i.email,
                i.role_code,
                <StatusBadge status={i.status} />,
                formatDate(i.expires_at),
              ])}
            />
            <Can anyOf={['invites.manage', 'users.manage', 'users.invite']}>
              <form onSubmit={invite} style={{marginTop: '1rem', maxWidth: 480}}>
                {mfaSecretOnce ? (
                  <Alert tone="info">
                    {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
                  </Alert>
                ) : null}
                <Field label={t('common.email')}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label={t('security.users.labelRole')}>
                  <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                    <option value="MERCHANT_ADMIN">MERCHANT_ADMIN</option>
                    <option value="MERCHANT_FINANCE">MERCHANT_FINANCE</option>
                    <option value="MERCHANT_DEVELOPER">MERCHANT_DEVELOPER</option>
                    <option value="MERCHANT_SUPPORT">MERCHANT_SUPPORT</option>
                    <option value="MERCHANT_VIEWER">MERCHANT_VIEWER</option>
                  </select>
                </Field>
                <Field label={t('security.users.labelTotp')}>
                  <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
                </Field>
                <Button type="submit">{t('security.users.sendInvite')}</Button>
              </form>
            </Can>
          </div>
        </>
      )}
    </div>
  );
}

export function RolesPage() {
  const {t} = useI18n();
  const {token, roles, permissions, hasPermission} = useAuth();
  const {push} = useToast();
  const [catalog, setCatalog] = useState<any>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>(['payments.read']);
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);

  const load = () => {
    if (!token) return;
    v4.rbacRoles(token)
      .then(setCatalog)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [token]);

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await obtainStepUp(token, totp);
      if (result.enrolled) {
        setMfaSecretOnce(result.mfaSecret || null);
        setError(t('security.mfaEnrolled'));
        setTotp('');
        return;
      }
      await v4.createCustomRole(token, {name, permissions: selected}, result.stepUpToken);
      push('Custom role created');
      setName('');
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('security.roles.title')}
        description={t('security.roles.description')}
        crumbs={[{label: t('section.security')}, {label: t('nav.roles')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone="info">{t('security.roles.backendAlert')}</Alert>
      <div className="v4-card">
        <p>
          <strong>{t('security.roles.yourRoles')}</strong> {roles.join(', ') || '—'}
        </p>
        <p>
          <strong>{t('security.roles.yourPermissions', {count: permissions.length})}</strong>
        </p>
        <ul>
          {permissions.slice(0, 40).map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
          {permissions.length > 40 ? (
            <li>{t('security.roles.andMore', {count: permissions.length - 40})}</li>
          ) : null}
        </ul>
      </div>
      {catalog ? (
        <div className="v4-card" style={{marginTop: '1rem'}}>
          <h3>{t('security.roles.customRoles')}</h3>
          <DataTable
            columns={[t('security.roles.colCode'), t('common.name'), t('security.roles.colPermissions')]}
            rows={(catalog.custom_roles || []).map((r: any) => [
              r.code,
              r.name,
              (r.permissions || []).slice(0, 8).join(', ') + ((r.permissions || []).length > 8 ? '…' : ''),
            ])}
          />
          <Can anyOf={['roles.manage']}>
            <form onSubmit={createRole} style={{marginTop: '1rem'}}>
              {mfaSecretOnce ? (
                <Alert tone="info">
                  {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
                </Alert>
              ) : null}
              <Field label={t('security.roles.labelName')}>
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label={t('security.roles.labelPermissions')} hint={t('security.roles.permissionsHint')}>
                <input
                  value={selected.join(',')}
                  onChange={(e) =>
                    setSelected(
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </Field>
              <Field label={t('security.users.labelTotp')}>
                <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
              </Field>
              <Button type="submit" disabled={!hasPermission('roles.manage')}>
                {t('security.roles.create')}
              </Button>
            </form>
          </Can>
        </div>
      ) : null}
    </div>
  );
}

function EventListPage({kind}: {kind: 'audit' | 'security' | 'errors'}) {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const meta = {
    audit: {
      title: t('security.audit.title'),
      description: t('security.audit.description'),
      crumb: t('nav.audit'),
    },
    security: {
      title: t('security.events.title'),
      description: t('security.events.description'),
      crumb: t('nav.securityEvents'),
    },
    errors: {
      title: t('security.errors.title'),
      description: t('security.errors.description'),
      crumb: t('nav.errors'),
    },
  }[kind];

  useEffect(() => {
    if (!token) return;
    const loader =
      kind === 'audit' ? v4.auditEvents : kind === 'security' ? v4.securityEvents : v4.errorReports;
    loader(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, kind]);

  return (
    <div>
      <PageHeader
        title={meta.title}
        description={meta.description}
        crumbs={[{label: t('section.security')}, {label: meta.crumb}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('security.audit.colId'),
            t('security.audit.colAction'),
            t('security.audit.colActor'),
            t('common.created'),
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            r.action || r.event_type || '—',
            shortId(r.actor_user_id || r.user_id),
            formatDate(r.created_at),
          ])}
        />
      )}
    </div>
  );
}

export function AuditPage() {
  return <EventListPage kind="audit" />;
}

export function SecurityEventsPage() {
  return <EventListPage kind="security" />;
}

export function ErrorsPage() {
  return <EventListPage kind="errors" />;
}

export function OrganizationPage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const [org, setOrg] = useState<any>(null);
  const [form, setForm] = useState({name: '', default_currency: 'SAR', locale: 'en', timezone: 'Asia/Riyadh'});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const canManage = hasPermission('org.manage');

  useEffect(() => {
    if (!token) return;
    v4.orgCurrent(token)
      .then((o) => {
        setOrg(o);
        setForm({
          name: o.name || '',
          default_currency: o.default_currency || 'SAR',
          locale: o.locale || 'en',
          timezone: o.timezone || 'UTC',
        });
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const updated = await v4.updateOrgCurrent(token, form);
      setOrg(updated);
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('settings.organization.title')}
        description={t('settings.organization.description')}
        crumbs={[{label: t('section.settings')}, {label: t('nav.organization')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">{t('settings.organization.saved')}</Alert> : null}
      {!org ? (
        <LoadingState />
      ) : canManage ? (
        <form className="v4-card" onSubmit={(e) => void save(e)} style={{maxWidth: 520}}>
          <Field label={t('settings.organization.name')}>
            <input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
          </Field>
          <Field label={t('settings.organization.currency')}>
            <input
              value={form.default_currency}
              onChange={(e) => setForm({...form, default_currency: e.target.value.toUpperCase()})}
              maxLength={3}
            />
          </Field>
          <Field label={t('settings.organization.locale')}>
            <select value={form.locale} onChange={(e) => setForm({...form, locale: e.target.value})}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
          <Field label={t('settings.organization.timezone')}>
            <input value={form.timezone} onChange={(e) => setForm({...form, timezone: e.target.value})} />
          </Field>
          <div style={{fontSize: 13, color: 'var(--v4-text-muted)', marginBottom: 12}}>
            {t('settings.organization.slugReadonly', {slug: org.slug})}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </form>
      ) : (
        <div className="v4-card">
          <p>
            <strong>{org.name}</strong>
          </p>
          <p style={{color: 'var(--v4-text-muted)'}}>{org.slug}</p>
        </div>
      )}
    </div>
  );
}

export function AppearancePage() {
  const {t, locale, setLocale, theme, setTheme} = useI18n();

  return (
    <div>
      <PageHeader
        title={t('settings.appearance.title')}
        description={t('settings.appearance.description')}
        crumbs={[{label: t('section.settings')}, {label: t('nav.appearance')}]}
      />
      <div className="v4-card" style={{maxWidth: 420}}>
        <label className="v4-field">
          {t('settings.appearance.theme')}
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
            <option value="light">{t('settings.appearance.themeLight')}</option>
            <option value="dark">{t('settings.appearance.themeDark')}</option>
          </select>
        </label>
        <label className="v4-field">
          {t('settings.appearance.language')}
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            <option value="en">{t('settings.appearance.langEn')}</option>
            <option value="ar">{t('settings.appearance.langAr')}</option>
          </select>
        </label>
      </div>
    </div>
  );
}
