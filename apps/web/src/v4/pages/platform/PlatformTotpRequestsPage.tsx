import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {obtainStepUp} from '../../rbac/stepUp';
import {useBusyAction} from '../../hooks/useBusyAction';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';
import {formatActor} from '../../i18n/humanize';

export function PlatformTotpRequestsPage() {
  const {t} = useI18n();
  const {token, hasRole, hasPermission} = useAuth();
  const {push} = useToast();
  const {busy, busyKey, run} = useBusyAction();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('PENDING');
  const [totp, setTotp] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const canReview = hasRole('PLATFORM_OWNER') || hasPermission('platform.admin');

  const load = () => {
    if (!token) return;
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    v4
      .platformMfaTotpRequests(token, q)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, status]);

  const decide = async (id: string, action: 'approve' | 'deny') => {
    setError('');
    await run(async () => {
      try {
        const step = await obtainStepUp(token, totp);
        if (step.enrolled) {
          setError(t('platform.team.mfaEnrolled'));
          return;
        }
        if (action === 'approve') {
          await v4.approvePlatformMfaTotpRequest(token, id, {note: note || undefined}, step.stepUpToken);
          push(t('platform.totp.approved'));
        } else {
          await v4.denyPlatformMfaTotpRequest(token, id, {note: note || undefined}, step.stepUpToken);
          push(t('platform.totp.denied'));
        }
        setTotp('');
        load();
      } catch (err: any) {
        setError(err.message);
      }
    }, `${action}:${id}`);
  };

  return (
    <div>
      <PageHeader
        title={t('platform.totp.title')}
        description={t('platform.totp.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.platformTotp')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12, flexWrap: 'wrap', gap: 8}}>
        <Field label={t('common.status')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">{t('status.PENDING')}</option>
            <option value="APPROVED">{t('status.APPROVED')}</option>
            <option value="DENIED">{t('status.DENIED')}</option>
            <option value="">{t('common.all')}</option>
          </select>
        </Field>
        {canReview ? (
          <>
            <Field label={t('security.users.labelTotp')}>
              <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label={t('platform.totp.note')}>
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </>
        ) : null}
        <Button type="button" variant="secondary" onClick={load} style={{alignSelf: 'end'}}>
          {t('common.refresh')}
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('common.id'),
            t('common.user'),
            t('platform.obs.colOrg'),
            t('common.status'),
            t('common.date'),
            t('common.actions'),
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            formatActor({actor_name: r.user_name, actor_email: r.user_email}),
            r.organization_name || '—',
            <StatusBadge status={r.status} />,
            formatDate(r.requested_at),
            canReview && r.status === 'PENDING' ? (
              <span style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                <Button
                  type="button"
                  busy={busyKey === `approve:${r.id}`}
                  disabled={busy || !totp}
                  onClick={() => void decide(r.id, 'approve')}
                >
                  {t('platform.totp.approve')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  busy={busyKey === `deny:${r.id}`}
                  disabled={busy || !totp}
                  onClick={() => void decide(r.id, 'deny')}
                >
                  {t('platform.totp.deny')}
                </Button>
              </span>
            ) : (
              r.reason || '—'
            ),
          ])}
          empty={<p>{t('platform.totp.empty')}</p>}
        />
      )}
    </div>
  );
}
