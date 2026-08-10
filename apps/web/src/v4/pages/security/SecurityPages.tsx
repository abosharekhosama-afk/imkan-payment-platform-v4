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
import {formatDate, shortId} from '../../utils/money';

export function UsersPage() {
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
        setError('MFA enrolled — enter a TOTP from your authenticator and submit again.');
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
        title="Users & invitations"
        description="Member list and pending invitations. Creating invites requires step-up."
        crumbs={[{label: 'Security'}, {label: 'Users'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>Members</h3>
            <DataTable
              columns={['User', 'Email', 'Roles', 'Status']}
              rows={rows.map((r) => [
                shortId(r.id || r.user_id),
                r.email,
                Array.isArray(r.roles) ? r.roles.join(', ') : r.role_code || '—',
                <StatusBadge status={r.status} />,
              ])}
            />
          </div>
          <div className="v4-card">
            <h3>Invitations</h3>
            <DataTable
              columns={['Invite', 'Email', 'Role', 'Status', 'Expires']}
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
                    MFA secret (copy now): <code>{mfaSecretOnce}</code>
                  </Alert>
                ) : null}
                <Field label="Email">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="Role">
                  <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                    <option value="MERCHANT_ADMIN">MERCHANT_ADMIN</option>
                    <option value="MERCHANT_FINANCE">MERCHANT_FINANCE</option>
                    <option value="MERCHANT_DEVELOPER">MERCHANT_DEVELOPER</option>
                    <option value="MERCHANT_SUPPORT">MERCHANT_SUPPORT</option>
                    <option value="MERCHANT_VIEWER">MERCHANT_VIEWER</option>
                  </select>
                </Field>
                <Field label="TOTP (step-up)">
                  <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
                </Field>
                <Button type="submit">Send invitation</Button>
              </form>
            </Can>
          </div>
        </>
      )}
    </div>
  );
}

export function RolesPage() {
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
        setError('MFA enrolled — enter a TOTP from your authenticator and submit again.');
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
        title="Roles & permissions"
        description="System roles are seeded. Custom roles cannot exceed your own permissions."
        crumbs={[{label: 'Security'}, {label: 'Roles'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone="info">Backend RBAC is authoritative. UI hides controls only.</Alert>
      <div className="v4-card">
        <p>
          <strong>Your roles:</strong> {roles.join(', ') || '—'}
        </p>
        <p>
          <strong>Your permissions ({permissions.length}):</strong>
        </p>
        <ul>
          {permissions.slice(0, 40).map((p) => (
            <li key={p}>
              <code>{p}</code>
            </li>
          ))}
          {permissions.length > 40 ? <li>…and {permissions.length - 40} more</li> : null}
        </ul>
      </div>
      {catalog ? (
        <div className="v4-card" style={{marginTop: '1rem'}}>
          <h3>Organization custom roles</h3>
          <DataTable
            columns={['Code', 'Name', 'Permissions']}
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
                  MFA secret (copy now): <code>{mfaSecretOnce}</code>
                </Alert>
              ) : null}
              <Field label="Custom role name">
                <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Permissions (subset of yours)" hint="Comma-separated codes you already hold">
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
              <Field label="TOTP (step-up)">
                <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
              </Field>
              <Button type="submit" disabled={!hasPermission('roles.manage')}>
                Create custom role
              </Button>
            </form>
          </Can>
        </div>
      ) : null}
    </div>
  );
}

function EventListPage({
  title,
  description,
  kind,
}: {
  title: string;
  description: string;
  kind: 'audit' | 'security' | 'errors';
}) {
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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
      <PageHeader title={title} description={description} crumbs={[{label: 'Security'}, {label: title}]} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['ID', 'Action / Type', 'Actor', 'Created']}
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
  return (
    <EventListPage
      title="Audit events"
      description="Organization audit trail from PostgreSQL."
      kind="audit"
    />
  );
}

export function SecurityEventsPage() {
  return (
    <EventListPage
      title="Security events"
      description="Login, logout, and security-relevant events."
      kind="security"
    />
  );
}

export function ErrorsPage() {
  return (
    <EventListPage
      title="Error reports"
      description="Captured application error reports for the organization."
      kind="errors"
    />
  );
}

export function OrganizationPage() {
  const {token} = useAuth();
  const [org, setOrg] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    v4.orgCurrent(token)
      .then(setOrg)
      .catch((e) => setError(e.message));
  }, [token]);

  return (
    <div>
      <PageHeader title="Organization" crumbs={[{label: 'Settings'}, {label: 'Organization'}]} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!org ? <LoadingState /> : <div className="v4-card"><pre style={{whiteSpace: 'pre-wrap'}}>{JSON.stringify(org, null, 2)}</pre></div>}
    </div>
  );
}

export function AppearancePage() {
  const [theme, setTheme] = useState(localStorage.getItem('v4_theme') || 'light');
  const [lang, setLang] = useState(localStorage.getItem('v4_lang') || 'en');

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('v4_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('v4_lang', lang);
  }, [lang]);

  return (
    <div>
      <PageHeader
        title="Appearance"
        description="Theme and localization readiness (client-side)."
        crumbs={[{label: 'Settings'}, {label: 'Appearance'}]}
      />
      <div className="v4-card" style={{maxWidth: 420}}>
        <label className="v4-field">
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="v4-field">
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
      </div>
    </div>
  );
}
