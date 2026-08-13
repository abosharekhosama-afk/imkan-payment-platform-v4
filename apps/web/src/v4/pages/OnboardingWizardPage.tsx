import React, {useEffect, useMemo, useState} from 'react';
import {Link, Navigate, useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';
import {kybRequirementLabel} from '../utils/kyb-labels';

/** Paths allowed while KYB is still DRAFT / incomplete (UX only — backend enforces money APIs). */
export const ONBOARDING_ALLOWLIST_PREFIXES = [
  '/onboarding',
  '/merchant/',
  '/security/',
  '/account/',
  '/settings/',
  '/help',
  '/support',
  '/logout',
];

export function isOnboardingAllowlistedPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '') return false;
  return ONBOARDING_ALLOWLIST_PREFIXES.some(
    (p) => pathname === p.replace(/\/$/, '') || pathname.startsWith(p),
  );
}

function kybCaseStatus(kyb: any): string {
  return String(kyb?.case?.status || kyb?.status || 'DRAFT').toUpperCase();
}

export function OnboardingWizardPage() {
  const {t} = useI18n();
  const {token, loading} = useAuth();
  const navigate = useNavigate();
  const [kyb, setKyb] = useState<any>(null);
  const [error, setError] = useState('');

  const STEPS = useMemo(
    () =>
      [
        {key: 'profile', label: t('onboarding.stepLegal'), to: '/merchant/profile', hint: t('onboarding.stepProfileHint')},
        {key: 'business', label: t('onboarding.stepBusiness'), to: '/merchant/business', hint: t('onboarding.stepBusinessHint')},
        {key: 'people', label: t('onboarding.stepPeople'), to: '/merchant/people', hint: t('onboarding.stepPeopleHint')},
        {key: 'documents', label: t('onboarding.stepDocuments'), to: '/merchant/documents', hint: t('onboarding.stepDocumentsHint')},
        {key: 'bank', label: t('onboarding.stepBank'), to: '/merchant/bank-accounts', hint: t('onboarding.stepBankHint')},
        {key: 'kyb', label: t('onboarding.stepKyb'), to: '/merchant/kyb', hint: t('onboarding.stepKybHint')},
      ] as const,
    [t],
  );

  useEffect(() => {
    if (!token) return;
    v4.kyb(token)
      .then(setKyb)
      .catch((e) => setError(e.message));
  }, [token]);

  const progress = useMemo(() => {
    const reqs = kyb?.requirements || [];
    if (!reqs.length) return {pct: 0, done: 0, total: 0};
    const done = reqs.filter((r: any) => r.satisfied).length;
    return {pct: Math.round((done / reqs.length) * 100), done, total: reqs.length};
  }, [kyb]);

  if (loading) return <LoadingState label={t('onboarding.restoring')} />;
  if (!token) return <Navigate to="/login" replace />;

  const status = kybCaseStatus(kyb);
  const missing = kyb?.missing || [];
  const canEnterConsole = ['SUBMITTED', 'IN_REVIEW', 'UNDER_REVIEW', 'APPROVED'].includes(status);

  return (
    <div className="v4-login" style={{alignItems: 'flex-start', paddingTop: '2rem'}}>
      <div className="v4-card" style={{width: 'min(720px, 100%)', margin: '0 auto'}}>
        <PageHeader title={t('onboarding.title')} description={t('onboarding.description')} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {!kyb && !error ? <LoadingState label={t('onboarding.loading')} /> : null}
        {kyb ? (
          <>
            <div className="v4-stat-grid" style={{marginBottom: '1rem'}}>
              <div className="v4-stat">
                <span>{t('common.status')}</span>
                <strong>
                  <StatusBadge status={status} />
                </strong>
              </div>
              <div className="v4-stat">
                <span>{t('onboarding.requirements')}</span>
                <strong>
                  {progress.done}/{progress.total} ({progress.pct}%)
                </strong>
              </div>
              <div className="v4-stat">
                <span>{t('onboarding.missing')}</span>
                <strong>{missing.length}</strong>
              </div>
            </div>

            {missing.length ? (
              <Alert tone="warning">
                {t('onboarding.incomplete', {
                  items: missing
                    .map((m: any) => kybRequirementLabel(m.code || m.requirement_code || String(m), t))
                    .join(', '),
                })}
              </Alert>
            ) : canEnterConsole ? (
              <Alert tone="success">{t('onboarding.submitted')}</Alert>
            ) : (
              <Alert tone="success">{t('onboarding.checklistReady')}</Alert>
            )}

            {!canEnterConsole ? <Alert tone="info">{t('onboarding.fillStepsUnlock')}</Alert> : null}

            <ol style={{paddingLeft: '1.25rem', lineHeight: 1.8}}>
              {STEPS.map((step, i) => (
                <li key={step.key} style={{marginBottom: '0.75rem'}}>
                  <strong>
                    {i + 1}. {step.label}
                  </strong>
                  <div style={{color: 'var(--v4-text-muted)', fontSize: '0.9rem'}}>{step.hint}</div>
                  <Link to={step.to}>{t('onboarding.openStep')}</Link>
                </li>
              ))}
            </ol>

            <div className="v4-toolbar" style={{marginTop: '1.5rem', gap: '0.75rem'}}>
              {canEnterConsole ? (
                <Button type="button" onClick={() => navigate('/')}>
                  {t('onboarding.enterDashboard')}
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled title={t('onboarding.submitKybTitle')}>
                  {t('onboarding.dashboardLocked')}
                </Button>
              )}
              <Link to="/merchant/kyb">
                <Button type="button" variant="secondary">
                  {t('onboarding.reviewKyb')}
                </Button>
              </Link>
              <Link to="/security/users">
                <Button type="button" variant="secondary">
                  {t('onboarding.securitySettings')}
                </Button>
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * UI-only gate helper. Backend `assertMerchantPaymentsAllowed` is the security boundary.
 * Uses verification case status (not onboarding_status UI labels).
 */
export function shouldForceOnboarding(kyb: any): boolean {
  const status = kybCaseStatus(kyb);
  if (status === 'APPROVED' || status === 'SUBMITTED' || status === 'IN_REVIEW' || status === 'UNDER_REVIEW') {
    return false;
  }
  return true;
}
