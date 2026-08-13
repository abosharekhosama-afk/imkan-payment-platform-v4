import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Select} from '../../design-system/Select';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';
import {formatReason, formatStatus} from '../../i18n/humanize';

export function PlatformBankListPage() {
  const {t, locale} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('PENDING_VERIFICATION');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4
      .adminBankAccounts(token, status)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, status]);

  return (
    <div>
      <PageHeader
        title={t('platform.bank.title')}
        description={t('platform.bank.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.bankReview')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12}}>
        <Field label={t('platform.kyb.statusFilter')}>
          <Select
            value={status}
            onChange={setStatus}
            options={[
              {value: 'PENDING_VERIFICATION', label: formatStatus('PENDING_VERIFICATION', locale)},
              {value: 'VERIFIED', label: formatStatus('VERIFIED', locale)},
              {value: 'ACTIVE', label: formatStatus('ACTIVE', locale)},
              {value: 'REJECTED', label: formatStatus('REJECTED', locale)},
              {value: 'DEACTIVATED', label: formatStatus('DEACTIVATED', locale)},
              {value: '', label: t('common.allStatuses')},
            ]}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={load}>
          {t('common.refresh')}
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('merchant.bank.colAccount'),
            t('platform.kyb.colOrganization'),
            t('merchant.bank.bankName'),
            t('merchant.bank.iban'),
            t('common.status'),
            t('common.created'),
            '',
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            r.organization_name || shortId(r.organization_id),
            r.bank_name || '—',
            r.account_number_masked || r.account_last4 || '—',
            <StatusBadge status={r.status} />,
            formatDate(r.created_at),
            <Link to={`/platform/bank-accounts/${r.id}`}>{t('platform.kyb.review')}</Link>,
          ])}
          empty={<p>{t('platform.bank.empty')}</p>}
        />
      )}
    </div>
  );
}

export function PlatformBankDetailPage() {
  const {t, locale} = useI18n();
  const {accountId = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = useState<'PASSED' | 'FAILED' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token || !accountId) return;
    setLoading(true);
    v4
      .adminBankAccount(token, accountId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, accountId]);

  const withStepUp = async (fn: (stepUpToken?: string) => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setError('');
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled && step.mfaSecret) {
        setMfaSecretOnce(step.mfaSecret);
        push(t('platform.bank.mfaEnrolled'));
        return;
      }
      await fn(step.stepUpToken);
      push(okMsg);
      setTotp('');
      setDecisionOpen(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!detail) return <Alert tone="danger">{error || t('platform.bank.notFound')}</Alert>;

  const openVerification = (detail.verifications || []).find(
    (v: any) => v.status === 'PENDING' || v.status === 'IN_PROGRESS',
  );

  return (
    <div>
      <PageHeader
        title={t('platform.bank.detailTitle', {id: shortId(accountId)})}
        description={detail.organization_name || t('platform.bank.description')}
        crumbs={[
          {label: t('section.platform')},
          {label: t('nav.bankReview'), to: '/platform/bank-accounts'},
          {label: shortId(accountId)},
        ]}
        actions={
          <Link to="/platform/bank-accounts">
            <Button type="button" variant="secondary">
              {t('platform.kyb.backQueue')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mfaSecretOnce ? (
        <Alert tone="warning">
          {t('platform.bank.mfaSetup')}
          <pre style={{marginTop: 8, overflow: 'auto'}}>{mfaSecretOnce}</pre>
        </Alert>
      ) : null}

      <div className="v4-card" style={{marginBottom: 16}}>
        <p>
          {t('common.status')} <StatusBadge status={detail.status} />
        </p>
        <p>
          {t('platform.kyb.labelOrganization')}{' '}
          {detail.organization_id ? (
            <Link to={`/platform/organizations/${detail.organization_id}`}>{detail.organization_name}</Link>
          ) : (
            detail.organization_name
          )}
        </p>
        <p>
          {t('merchant.bank.bankName')}: {detail.bank_name}
        </p>
        <p>
          {t('merchant.bank.holderName')}: {detail.account_holder_name}
        </p>
        <p>
          {t('merchant.bank.iban')}: {detail.account_number_masked || detail.account_last4}
        </p>
        <p>
          {t('common.currency')}: {detail.currency_code} · {detail.country_code}
        </p>
      </div>

      {(detail.history || []).length ? (
        <>
          <h3>{t('platform.kyb.history')}</h3>
          <DataTable
            columns={[t('platform.kyb.colFrom'), t('platform.kyb.colTo'), t('platform.kyb.colNote'), t('common.date')]}
            rows={(detail.history || []).map((h: any) => [
              formatStatus(h.from_status, locale),
              formatStatus(h.to_status, locale),
              formatReason(h.reason, locale),
              formatDate(h.created_at),
            ])}
          />
        </>
      ) : null}

      {(detail.verifications || []).length ? (
        <>
          <h3 style={{marginTop: 24}}>{t('platform.bank.verifications')}</h3>
          <DataTable
            columns={[t('common.status'), t('platform.kyb.colNote'), t('common.date')]}
            rows={(detail.verifications || []).map((v: any) => [
              <StatusBadge status={v.status} />,
              v.reason ? formatReason(v.reason, locale) : v.method || '—',
              formatDate(v.decided_at || v.created_at),
            ])}
          />
        </>
      ) : null}

      <div className="v4-toolbar" style={{marginTop: 24, gap: 8, flexWrap: 'wrap'}}>
        <Field label={t('finance.refunds.labelTotp')}>
          <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
        </Field>
        {detail.status === 'PENDING_VERIFICATION' && openVerification?.status === 'PENDING' ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  await v4.adminBankStartVerification(token, accountId);
                  push(t('platform.bank.reviewStarted'));
                  load();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            {t('platform.kyb.startReview')}
          </Button>
        ) : null}
        {detail.status === 'PENDING_VERIFICATION' ? (
          <>
            <Button type="button" disabled={busy} onClick={() => setDecisionOpen('PASSED')}>
              {t('platform.bank.approve')}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDecisionOpen('FAILED')}>
              {t('common.reject')}
            </Button>
          </>
        ) : null}
        {detail.status === 'VERIFIED' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void withStepUp((step) => v4.adminBankActivate(token, accountId, step), t('platform.bank.activated'))}
          >
            {t('platform.bank.activate')}
          </Button>
        ) : null}
      </div>

      {decisionOpen ? (
        <Modal title={t('platform.bank.modalDecision', {decision: decisionOpen})} onClose={() => setDecisionOpen(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void withStepUp(
                (step) =>
                  v4.adminBankDecision(
                    token,
                    accountId,
                    {result: decisionOpen, reason},
                    step,
                  ),
                decisionOpen === 'PASSED' ? t('platform.bank.verified') : t('platform.bank.rejected'),
              );
            }}
          >
            <Field label={t('platform.kyb.requestReason')}>
              <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={t('finance.refunds.labelTotp')}>
              <input required value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
            </Field>
            <Button type="submit" disabled={busy || reason.length < 3}>
              {busy ? t('common.processing') : t('common.confirm')}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
