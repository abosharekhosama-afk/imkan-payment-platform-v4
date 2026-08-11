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
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';

export function PlatformKybListPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('SUBMITTED');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4
      .adminKybCases(token, status)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, status]);

  return (
    <div>
      <PageHeader
        title={t('platform.kyb.title')}
        description={t('platform.kyb.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.kybReview')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12}}>
        <Field label={t('platform.kyb.statusFilter')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="UNDER_REVIEW">UNDER_REVIEW</option>
            <option value="NEEDS_INFORMATION">NEEDS_INFORMATION</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
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
            t('platform.kyb.colCase'),
            t('platform.kyb.colOrganization'),
            t('platform.kyb.colStatus'),
            t('platform.kyb.colSubmitted'),
            '',
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            r.organization_name || shortId(r.organization_id),
            <StatusBadge status={r.status} />,
            formatDate(r.submitted_at || r.created_at),
            <Link to={`/platform/kyb/${r.id}`}>{t('platform.kyb.review')}</Link>,
          ])}
          empty={<p>{t('platform.kyb.empty')}</p>}
        />
      )}
    </div>
  );
}

export function PlatformKybDetailPage() {
  const {t} = useI18n();
  const {caseId = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [totp, setTotp] = useState('');
  const [decisionOpen, setDecisionOpen] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token || !caseId) return;
    setLoading(true);
    v4
      .adminKybCase(token, caseId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, caseId]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      push(okMsg);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!detail) return <Alert tone="danger">{error || t('platform.kyb.caseNotFound')}</Alert>;

  const kase = detail.case;
  const docs = detail.documents || [];

  return (
    <div>
      <PageHeader
        title={t('platform.kyb.detailTitle', {id: shortId(caseId)})}
        description={detail.organization?.name || t('platform.kyb.detailDescription')}
        crumbs={[
          {label: t('section.platform')},
          {label: t('nav.kybReview'), to: '/platform/kyb'},
          {label: shortId(caseId)},
        ]}
        actions={
          <Link to="/platform/kyb">
            <Button type="button" variant="secondary">
              {t('platform.kyb.backQueue')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card" style={{marginBottom: 16}}>
        <p>
          {t('platform.kyb.statusLabel')} <StatusBadge status={kase.status} />
        </p>
        <p>
          {t('platform.kyb.labelOrganization')} {detail.organization?.name}
        </p>
        {detail.legal_profile ? (
          <p>
            {t('platform.kyb.labelLegal')} {detail.legal_profile.legal_name} —{' '}
            {detail.legal_profile.registration_number}
          </p>
        ) : null}
      </div>

      <h3>{t('platform.kyb.requirements')}</h3>
      <DataTable
        columns={[t('platform.kyb.colRequirement'), t('platform.kyb.colSatisfied'), t('merchant.kyb.colDetail')]}
        rows={(detail.requirements || []).map((r: any) => [
          r.code,
          r.satisfied ? t('common.yes') : t('common.no'),
          r.detail,
        ])}
      />

      <h3 style={{marginTop: 24}}>{t('platform.kyb.documents')}</h3>
      <DataTable
        columns={[
          t('merchant.documents.colDocument'),
          t('merchant.documents.colType'),
          t('common.status'),
          t('platform.kyb.colFile'),
          t('platform.kyb.colActions'),
        ]}
        rows={docs.map((d: any) => [
          shortId(d.id),
          d.document_type_code,
          <StatusBadge status={d.status} />,
          d.has_file ? t('common.uploaded') : '—',
          <span style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            {d.has_file ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void v4.openAdminDocument(token, d.id).catch((e) => setError(e.message))}
              >
                {t('common.view')}
              </Button>
            ) : null}
            {['UPLOADED', 'PENDING_REVIEW'].includes(d.status) ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => v4.adminDocumentReview(token, d.id, {decision: 'ACCEPTED'}),
                      'Document accepted',
                    )
                  }
                >
                  {t('common.accept')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    const r = window.prompt(t('platform.kyb.rejectionPrompt'));
                    if (!r) return;
                    void act(
                      () => v4.adminDocumentReview(token, d.id, {decision: 'REJECTED', reason: r}),
                      'Document rejected',
                    );
                  }}
                >
                  {t('common.reject')}
                </Button>
              </>
            ) : null}
          </span>,
        ])}
      />

      <div className="v4-toolbar" style={{marginTop: 24, gap: 8, flexWrap: 'wrap'}}>
        {kase.status === 'SUBMITTED' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void act(() => v4.adminKybStartReview(token, caseId), 'Review started')}
          >
            {t('platform.kyb.startReview')}
          </Button>
        ) : null}
        {kase.status === 'UNDER_REVIEW' ? (
          <>
            <Field label={t('platform.kyb.requestReason')}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || reason.length < 3}
              onClick={() =>
                void act(
                  () => v4.adminKybRequestInfo(token, caseId, {reason}),
                  'Information requested',
                )
              }
            >
              {t('platform.kyb.requestInfo')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => setDecisionOpen('APPROVED')}>
              {t('platform.kyb.approve')}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setDecisionOpen('REJECTED')}>
              {t('common.reject')}
            </Button>
          </>
        ) : null}
      </div>

      {decisionOpen ? (
        <Modal
          title={t('platform.kyb.modalDecision', {decision: decisionOpen})}
          onClose={() => setDecisionOpen(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setBusy(true);
                setError('');
                try {
                  const step = await obtainStepUp(token, totp);
                  if (step.enrolled) {
                    setError(t('common.mfaEnrolled'));
                    setTotp('');
                    return;
                  }
                  await v4.adminKybDecision(token, caseId, {
                    decision: decisionOpen,
                    reason,
                    stepUpToken: step.stepUpToken,
                  });
                  push(`Case ${decisionOpen.toLowerCase()}`);
                  setDecisionOpen(null);
                  setReason('');
                  setTotp('');
                  load();
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Field label={t('platform.kyb.decisionReason')}>
              <textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={t('security.users.labelTotp')}>
              <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
            </Field>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Button type="submit" disabled={busy}>
              {t('platform.kyb.confirmDecision', {decision: decisionOpen})}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
