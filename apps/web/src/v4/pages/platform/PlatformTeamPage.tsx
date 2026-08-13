import React, {useCallback, useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';
import {formatRole, formatRoles} from '../../i18n/humanize';

const PLATFORM_ROLES = ['PLATFORM_ADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_FINANCE'] as const;

export function PlatformTeamPage() {
  const {t, locale} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [roleCode, setRoleCode] = useState<(typeof PLATFORM_ROLES)[number]>('PLATFORM_ADMIN');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.platformUsers(token), v4.platformInvitations(token)])
      .then(([u, inv]) => {
        setUsers(u);
        setInvitations(inv);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !email) return;
    setBusy(true);
    setError('');
    setInviteLink(null);
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled) {
        setMfaSecretOnce(step.mfaSecret || null);
        push(t('platform.team.mfaEnrolled'));
        return;
      }
      const created = await v4.createPlatformInvitation(token, {email, role_code: roleCode}, step.stepUpToken);
      push(t('platform.team.invited'));
      if (created?.token) {
        setInviteLink(`${window.location.origin}/accept-invitation?token=${encodeURIComponent(created.token)}`);
      }
      setEmail('');
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message || t('platform.team.inviteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!token) return;
    setError('');
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled) {
        setMfaSecretOnce(step.mfaSecret || null);
        push(t('platform.team.mfaEnrolled'));
        return;
      }
      await v4.revokePlatformInvitation(token, id, step.stepUpToken);
      push(t('platform.team.revoked'));
      load();
    } catch (err: any) {
      setError(err.message || t('platform.team.revokeFailed'));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('platform.team.title')}
        description={t('platform.team.description')}
        crumbs={[{label: t('section.platform')}, {label: t('platform.team.title')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mfaSecretOnce ? (
        <Alert tone="warning">
          {t('platform.team.mfaEnrolledSave')} <code>{mfaSecretOnce}</code>
        </Alert>
      ) : null}
      {inviteLink ? (
        <Alert tone="info">
          {t('platform.team.inviteLink')} <code>{inviteLink}</code>
        </Alert>
      ) : null}

      <Can anyOf={['platform.users.manage', 'platform.admin']}>
        <div className="v4-card" style={{marginBottom: 16}}>
          <h3 style={{marginTop: 0}}>{t('platform.team.inviteTitle')}</h3>
          <p style={{color: 'var(--v4-text-muted)', marginTop: 0}}>{t('platform.team.inviteHint')}</p>
          <form onSubmit={(e) => void invite(e)}>
            <div style={{display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
              <Field label={t('common.email')}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
              </Field>
              <Field label={t('platform.team.role')}>
                <select value={roleCode} onChange={(e) => setRoleCode(e.target.value as typeof roleCode)}>
                  {PLATFORM_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {formatRole(r, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('security.users.labelTotp')}>
                <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
              </Field>
            </div>
            <Button type="submit" disabled={busy || !email} style={{marginTop: 12}}>
              {busy ? t('common.saving') : t('platform.team.sendInvite')}
            </Button>
          </form>
        </div>
      </Can>

      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3 style={{marginTop: 0}}>{t('platform.team.membersTitle')}</h3>
            <DataTable
              columns={[t('common.email'), t('platform.team.name'), t('platform.team.role'), t('common.status')]}
              rows={users.map((u) => [
                u.email,
                u.name || '—',
                formatRoles(u.roles, locale),
                <StatusBadge status={u.status} />,
              ])}
              empty={<p>{t('platform.team.membersEmpty')}</p>}
            />
          </div>

          <div className="v4-card">
            <h3 style={{marginTop: 0}}>{t('platform.team.invitationsTitle')}</h3>
            <DataTable
              columns={[t('common.email'), t('platform.team.role'), t('common.status'), t('platform.team.expires'), '']}
              rows={invitations.map((inv) => [
                inv.email,
                formatRole(inv.role_code, locale),
                <StatusBadge status={inv.status} />,
                formatDate(inv.expires_at),
                inv.status === 'PENDING' ? (
                  <Can anyOf={['platform.users.manage', 'platform.admin']}>
                    <Button type="button" variant="secondary" onClick={() => void revoke(inv.id)}>
                      {t('platform.team.revoke')}
                    </Button>
                  </Can>
                ) : (
                  shortId(inv.id)
                ),
              ])}
              empty={<p>{t('platform.team.invitationsEmpty')}</p>}
            />
          </div>
        </>
      )}
    </div>
  );
}
