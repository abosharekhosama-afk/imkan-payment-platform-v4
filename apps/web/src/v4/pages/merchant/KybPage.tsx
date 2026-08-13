import React, {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';
import {documentTypeLabel, kybRequirementLabel, kybRequirementTypeLabel} from '../../utils/kyb-labels';
import {ApiError} from '../../api/client';
import {useI18n} from '../../i18n/I18nProvider';

export function KybPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const navigate = useNavigate();
  const [kyb, setKyb] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.kyb(token)
      .then(setKyb)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  if (loading) return <LoadingState />;

  const caseStatus = String(kyb?.case?.status || 'DRAFT').toUpperCase();
  const missing = kyb?.missing || [];
  const requirements = kyb?.requirements || [];
  const canSubmit = ['DRAFT', 'NEEDS_INFORMATION'].includes(caseStatus) && missing.length === 0;
  const canEnterDashboard = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'IN_REVIEW'].includes(caseStatus);

  return (
    <div>
      <PageHeader
        title={t('merchant.kyb.title')}
        description={t('merchant.kyb.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.kyb')}]}
        actions={
          <div className="v4-toolbar" style={{gap: 8}}>
            <Link to="/onboarding">
              <Button type="button" variant="secondary">
                {t('merchant.kyb.onboarding')}
              </Button>
            </Link>
            {canEnterDashboard ? (
              <Button type="button" onClick={() => navigate('/')}>
                {t('merchant.kyb.enterDashboard')}
              </Button>
            ) : null}
            <Can anyOf={['kyb.submit']}>
              <Button
                type="button"
                disabled={!canSubmit || submitting}
                onClick={() => {
                  if (!token) return;
                  setSubmitting(true);
                  setError('');
                  void v4
                    .kybSubmit(token, {})
                    .then(() => {
                      push(t('toast.kybSubmitted'));
                      load();
                      navigate('/');
                    })
                    .catch((e) => {
                      if (e instanceof ApiError && e.details) {
                        const miss = (e.details as any)?.missing;
                        if (Array.isArray(miss) && miss.length) {
                          setError(
                            `${t('merchant.kyb.completeMissingBefore')} ${miss
                              .map((m: any) => kybRequirementLabel(m.code || m.requirement_type || String(m), t))
                              .join(', ')}`,
                          );
                          return;
                        }
                      }
                      setError(e.message);
                    })
                    .finally(() => setSubmitting(false));
                }}
              >
                {submitting ? t('merchant.kyb.submitting') : t('merchant.kyb.submit')}
              </Button>
            </Can>
          </div>
        }
      />
      <Alert tone="warning">{t('merchant.kyb.verificationAlert')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="v4-stat-grid" style={{marginBottom: '1rem'}}>
        <div className="v4-stat">
          <span>{t('merchant.kyb.caseStatus')}</span>
          <strong>
            <StatusBadge status={caseStatus} />
          </strong>
        </div>
        <div className="v4-stat">
          <span>{t('onboarding.requirements')}</span>
          <strong>
            {requirements.filter((r: any) => r.satisfied).length}/{requirements.length}
          </strong>
        </div>
        <div className="v4-stat">
          <span>{t('merchant.kyb.missingLabel')}</span>
          <strong>{missing.length}</strong>
        </div>
      </div>

      {missing.length ? (
        <Alert tone="warning">
          {t('merchant.kyb.completeMissingBefore')}{' '}
          {missing.map((m: any) => kybRequirementLabel(m.code || m.requirement_type, t)).join(' · ')}
        </Alert>
      ) : canSubmit ? (
        <Alert tone="success">{t('merchant.kyb.allReady')}</Alert>
      ) : canEnterDashboard ? (
        <Alert tone="success">{t('merchant.kyb.submitted')}</Alert>
      ) : null}

      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>{t('merchant.kyb.checklist')}</h3>
        <DataTable
          columns={[
            t('merchant.kyb.colRequirement'),
            t('merchant.kyb.colType'),
            t('common.status'),
            t('merchant.kyb.colDetail'),
          ]}
          rows={requirements.map((r: any) => [
            kybRequirementLabel(r.code, t),
            kybRequirementTypeLabel(r.requirement_type, t),
            r.satisfied ? t('merchant.kyb.ok') : t('merchant.kyb.missingLabel'),
            r.detail || '—',
          ])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.kyb.noRequirements')}</p>}
        />
      </div>

      <div className="v4-card">
        <h3>{t('merchant.kyb.documentsOnFile')}</h3>
        <DataTable
          columns={[
            t('merchant.documents.colDocument'),
            t('merchant.documents.colType'),
            t('common.status'),
            t('merchant.documents.colFile'),
            t('common.created'),
          ]}
          rows={(kyb?.documents || []).map((d: any) => [
            shortId(d.id),
            documentTypeLabel(d.document_type_code || '', t),
            <StatusBadge status={d.status} />,
            d.has_file ? t('common.yes') : t('merchant.documents.filePending'),
            formatDate(d.created_at),
          ])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>{t('merchant.kyb.noDocuments')}</p>}
        />
      </div>
    </div>
  );
}
