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
import {useBusyAction} from '../../hooks/useBusyAction';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import type {Locale} from '../../i18n/index';
import type {ThemeMode} from '../../theme';
import {formatDate, shortId} from '../../utils/money';
import {formatActor, formatEventAction, formatPermission, formatRole, formatRoles} from '../../i18n/humanize';

export function UsersPage() {
  const {t, locale} = useI18n();
  const {token, organizationId, user, hasRole, hasPermission} = useAuth();
  const {push} = useToast();
  const {busy, busyKey, run} = useBusyAction();
  const [rows, setRows] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState('MERCHANT_VIEWER');
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);

  const canManageMembers =
    hasRole('MERCHANT_OWNER', 'PLATFORM_OWNER') || hasPermission('platform.admin');

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

  const withStepUp = async (fn: (stepUpToken?: string) => Promise<void>) => {
    const result = await obtainStepUp(token, totp);
    if (result.enrolled) {
      setMfaSecretOnce(result.mfaSecret || null);
      setError(t('security.mfaEnrolled'));
      setTotp('');
      return;
    }
    await fn(result.stepUpToken);
    setTotp('');
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setError('');
    await run(async () => {
      try {
        await withStepUp(async (stepUpToken) => {
          await v4.createInvitation(token, organizationId, {email, role_code: roleCode}, stepUpToken);
          push(t('toast.invitationCreated'));
          setEmail('');
          load();
        });
      } catch (err: any) {
        setError(err.message);
      }
    }, 'invite');
  };

  const revokeInvite = async (invitationId: string) => {
    if (!organizationId) return;
    setError('');
    await run(async () => {
      try {
        await withStepUp(async (stepUpToken) => {
          await v4.revokeInvitation(token, organizationId, invitationId, stepUpToken);
          push(t('toast.invitationRevoked'));
          load();
        });
      } catch (err: any) {
        setError(err.message);
      }
    }, `revoke:${invitationId}`);
  };

  const deactivateMember = async (memberId: string) => {
    if (!organizationId) return;
    setError('');
    await run(async () => {
      try {
        await withStepUp(async (stepUpToken) => {
          await v4.deactivateMember(token, organizationId, memberId, stepUpToken);
          push(t('toast.memberDeactivated'));
          load();
        });
      } catch (err: any) {
        setError(err.message);
      }
    }, `deactivate:${memberId}`);
  };

  const removeMember = async (memberId: string) => {
    if (!organizationId) return;
    setError('');
    await run(async () => {
      try {
        await withStepUp(async (stepUpToken) => {
          await v4.removeMember(token, organizationId, memberId, stepUpToken);
          push(t('toast.memberRemoved'));
          load();
        });
      } catch (err: any) {
        setError(err.message);
      }
    }, `remove:${memberId}`);
  };

  const isOwnerRole = (r: any) => {
    const list = Array.isArray(r.roles) ? r.roles : r.role_code ? [r.role_code] : [];
    return list.includes('MERCHANT_OWNER');
  };

  return (
    <div>
      <PageHeader
        title={t('security.users.title')}
        description={t('security.users.description')}
        crumbs={[{label: t('section.security')}, {label: t('nav.users')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {canManageMembers ? (
        <Alert tone="info">{t('security.users.ownerOnlyHint')}</Alert>
      ) : (
        <Alert tone="info">{t('security.users.ownerOnlyReadHint')}</Alert>
      )}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>{t('security.users.members')}</h3>
            {canManageMembers ? (
              <Field label={t('security.users.labelTotp')} hint={t('security.users.actionsTotpHint')}>
                <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
              </Field>
            ) : null}
            {mfaSecretOnce ? (
              <Alert tone="info">
                {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
              </Alert>
            ) : null}
            <DataTable
              columns={[
                t('security.users.colUser'),
                t('common.email'),
                t('security.users.colRoles'),
                t('common.status'),
                t('common.actions'),
              ]}
              rows={rows.map((r) => {
                const memberId = r.id || r.user_id;
                const self = memberId === user?.id;
                return [
                  r.name || formatActor(r),
                  r.email,
                  Array.isArray(r.roles) ? formatRoles(r.roles, locale) : formatRole(r.role_code, locale),
                  <StatusBadge status={r.status || r.membership_status} />,
                  canManageMembers && !self && !isOwnerRole(r) ? (
                    <span className="v4-row-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        busy={busyKey === `deactivate:${memberId}`}
                        disabled={busy || !totp}
                        onClick={() => void deactivateMember(memberId)}
                      >
                        {t('security.users.deactivate')}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        busy={busyKey === `remove:${memberId}`}
                        disabled={busy || !totp}
                        onClick={() => void removeMember(memberId)}
                      >
                        {t('security.users.remove')}
                      </Button>
                    </span>
                  ) : (
                    '—'
                  ),
                ];
              })}
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
                t('common.actions'),
              ]}
              rows={invites.map((i) => [
                shortId(i.id),
                i.email,
                formatRole(i.role_code, locale),
                <StatusBadge status={i.status} />,
                formatDate(i.expires_at),
                canManageMembers && i.status === 'PENDING' ? (
                  <span className="v4-row-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      busy={busyKey === `revoke:${i.id}`}
                      disabled={busy || !totp}
                      onClick={() => void revokeInvite(i.id)}
                    >
                      {t('security.users.revokeInvite')}
                    </Button>
                  </span>
                ) : (
                  '—'
                ),
              ])}
            />
            <Can anyOf={['invites.manage', 'users.manage', 'users.invite']}>
              <form onSubmit={invite} style={{marginTop: '1rem', maxWidth: 480}}>
                <Field label={t('common.email')}>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label={t('security.users.labelRole')}>
                  <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                    <option value="MERCHANT_ADMIN">{formatRole('MERCHANT_ADMIN', locale)}</option>
                    <option value="MERCHANT_FINANCE">{formatRole('MERCHANT_FINANCE', locale)}</option>
                    <option value="MERCHANT_DEVELOPER">{formatRole('MERCHANT_DEVELOPER', locale)}</option>
                    <option value="MERCHANT_SUPPORT">{formatRole('MERCHANT_SUPPORT', locale)}</option>
                    <option value="MERCHANT_VIEWER">{formatRole('MERCHANT_VIEWER', locale)}</option>
                  </select>
                </Field>
                <Field label={t('security.users.labelTotp')}>
                  <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
                </Field>
                <Button type="submit" busy={busyKey === 'invite'} busyLabel={t('common.processing')}>
                  {t('security.users.sendInvite')}
                </Button>
              </form>
            </Can>
          </div>
        </>
      )}
    </div>
  );
}

export function RolesPage() {
  const {t, locale} = useI18n();
  const {token, roles, permissions, hasPermission} = useAuth();
  const {push} = useToast();
  const {busy, run} = useBusyAction();
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
    await run(async () => {
      try {
        const result = await obtainStepUp(token, totp);
        if (result.enrolled) {
          setMfaSecretOnce(result.mfaSecret || null);
          setError(t('security.mfaEnrolled'));
          setTotp('');
          return;
        }
        await v4.createCustomRole(token, {name, permissions: selected}, result.stepUpToken);
        push(t('toast.roleCreated'));
        setName('');
        setTotp('');
        load();
      } catch (err: any) {
        setError(err.message);
      }
    });
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
          <strong>{t('security.roles.yourRoles')}</strong> {formatRoles(roles, locale)}
        </p>
        <p>
          <strong>{t('security.roles.yourPermissions', {count: permissions.length})}</strong>
        </p>
        <ul>
          {permissions.slice(0, 40).map((p) => (
            <li key={p}>
              {formatPermission(p, locale)}
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
              (r.permissions || []).slice(0, 8).map((p: string) => formatPermission(p, locale)).join(locale === 'ar' ? '، ' : ', ') +
                ((r.permissions || []).length > 8 ? '…' : ''),
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
              <Button type="submit" busy={busy} busyLabel={t('common.processing')} disabled={!hasPermission('roles.manage')}>
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
  const {t, locale} = useI18n();
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
    setLoading(true);
    const loader =
      kind === 'audit' ? v4.auditEvents : kind === 'security' ? v4.securityEvents : v4.errorReports;
    loader(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, kind]);

  const columns =
    kind === 'errors'
      ? [
          t('security.audit.colAction'),
          t('security.audit.colActor'),
          t('security.errors.colRoute'),
          t('security.errors.colCode'),
          t('common.created'),
        ]
      : kind === 'security'
        ? [
            t('security.events.colType'),
            t('security.audit.colActor'),
            t('common.status'),
            t('common.created'),
          ]
        : [t('security.audit.colAction'), t('security.audit.colActor'), t('common.created')];

  const tableRows =
    kind === 'errors'
      ? rows.map((r) => [
          r.message || formatEventAction(r.error_code, locale) || '—',
          formatActor(r),
          `${r.method || ''} ${r.route || ''}`.trim() || '—',
          r.error_code || r.status_code || '—',
          formatDate(r.created_at),
        ])
      : kind === 'security'
        ? rows.map((r) => [
            formatEventAction(r.event_type || r.action, locale),
            formatActor(r),
            r.success === false ? t('common.failed') : t('common.success'),
            formatDate(r.created_at),
          ])
        : rows.map((r) => [
            formatEventAction(r.action || r.event_type, locale),
            formatActor(r),
            formatDate(r.created_at),
          ]);

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
        <DataTable columns={columns} rows={tableRows} />
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
        <LoadingState variant="form" />
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
          <Button type="submit" busy={busy} busyLabel={t('common.saving')}>
            {t('common.save')}
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
  const {token} = useAuth();
  const {push} = useToast();
  const {busy, run} = useBusyAction();
  const [totpReason, setTotpReason] = useState('');
  const [totpMsg, setTotpMsg] = useState('');
  const [totpError, setTotpError] = useState('');

  const requestTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError('');
    setTotpMsg('');
    await run(async () => {
      try {
        await v4.requestTotpEmail(token, {reason: totpReason || undefined});
        setTotpMsg(t('settings.totp.requestSent'));
        setTotpReason('');
        push(t('settings.totp.requestSent'));
      } catch (err: any) {
        setTotpError(err.message);
      }
    });
  };

  return (
    <div>
      <PageHeader
        title={t('settings.appearance.title')}
        description={t('settings.appearance.description')}
        crumbs={[{label: t('section.settings')}, {label: t('nav.appearance')}]}
      />
      <div className="v4-card" style={{maxWidth: 420, marginBottom: 16}}>
        <Field label={t('settings.appearance.theme')}>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeMode)}>
            <option value="light">{t('settings.appearance.themeLight')}</option>
            <option value="dark">{t('settings.appearance.themeDark')}</option>
          </select>
        </Field>
        <Field label={t('settings.appearance.language')}>
          <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
            <option value="en">{t('settings.appearance.langEn')}</option>
            <option value="ar">{t('settings.appearance.langAr')}</option>
          </select>
        </Field>
      </div>

      <div className="v4-card" style={{maxWidth: 520}}>
        <h3 style={{marginTop: 0}}>{t('settings.totp.title')}</h3>
        <p style={{color: 'var(--v4-text-muted)'}}>{t('settings.totp.description')}</p>
        {totpError ? <Alert tone="danger">{totpError}</Alert> : null}
        {totpMsg ? <Alert tone="success">{totpMsg}</Alert> : null}
        <form onSubmit={(e) => void requestTotp(e)}>
          <Field label={t('settings.totp.reason')} hint={t('settings.totp.reasonHint')}>
            <input value={totpReason} onChange={(e) => setTotpReason(e.target.value)} maxLength={500} />
          </Field>
          <Button type="submit" busy={busy}>
            {t('settings.totp.request')}
          </Button>
        </form>
      </div>
    </div>
  );
}
