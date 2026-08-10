import React, {useEffect, useMemo, useState} from 'react';
import {Link, Navigate, useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../design-system/components';

const STEPS = [
  {key: 'profile', label: 'Legal / profile', to: '/merchant/profile', hint: 'Legal name, registration, entity type'},
  {key: 'business', label: 'Business information', to: '/merchant/business', hint: 'Trading name, industry, website'},
  {key: 'documents', label: 'Documents', to: '/merchant/documents', hint: 'Upload KYB supporting documents'},
  {key: 'bank', label: 'Bank / settlement', to: '/merchant/bank-accounts', hint: 'Settlement destination accounts'},
  {key: 'kyb', label: 'KYB review & submit', to: '/merchant/kyb', hint: 'Submit when requirements are satisfied'},
] as const;

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

export function OnboardingWizardPage() {
  const {token, loading} = useAuth();
  const navigate = useNavigate();
  const [kyb, setKyb] = useState<any>(null);
  const [error, setError] = useState('');

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

  if (loading) return <LoadingState label="Restoring session…" />;
  if (!token) return <Navigate to="/login" replace />;

  const status = String(kyb?.onboarding_status || kyb?.status || 'DRAFT').toUpperCase();
  const missing = kyb?.missing || [];
  const canEnterConsole = ['SUBMITTED', 'IN_REVIEW', 'UNDER_REVIEW', 'APPROVED'].includes(status);

  return (
    <div className="v4-login" style={{alignItems: 'flex-start', paddingTop: '2rem'}}>
      <div className="v4-card" style={{width: 'min(720px, 100%)', margin: '0 auto'}}>
        <PageHeader
          title="Merchant onboarding"
          description="Complete legal, business, banking, and KYB before operating payments. Skip flags are not trusted — payment APIs enforce KYB on the backend."
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {!kyb && !error ? <LoadingState label="Loading onboarding state…" /> : null}
        {kyb ? (
          <>
            <div className="v4-stat-grid" style={{marginBottom: '1rem'}}>
              <div className="v4-stat">
                <span>Status</span>
                <strong>
                  <StatusBadge status={status} />
                </strong>
              </div>
              <div className="v4-stat">
                <span>Requirements</span>
                <strong>
                  {progress.done}/{progress.total} ({progress.pct}%)
                </strong>
              </div>
              <div className="v4-stat">
                <span>Missing</span>
                <strong>{missing.length}</strong>
              </div>
            </div>

            <Alert tone="info">
              Email verification and transactional mail in production are <strong>BLOCKED BY: DEC-017</strong>. Dev
              tokens may be returned when exposeDevTokens is enabled.
            </Alert>

            {missing.length ? (
              <Alert tone="warning">
                Onboarding is incomplete. Missing: {missing.map((m: any) => m.code || m.requirement_code || m).join(', ')}
              </Alert>
            ) : (
              <Alert tone="success">Checklist satisfied — submit KYB when ready, then configure a provider.</Alert>
            )}

            {!canEnterConsole ? (
              <Alert tone="warning">
                You can finish onboarding steps and security settings, but payment operations stay blocked until KYB is
                submitted (enforced by the API, not the browser).
              </Alert>
            ) : null}

            <ol style={{paddingLeft: '1.25rem', lineHeight: 1.8}}>
              {STEPS.map((step, i) => (
                <li key={step.key} style={{marginBottom: '0.75rem'}}>
                  <strong>
                    {i + 1}. {step.label}
                  </strong>
                  <div style={{color: 'var(--v4-text-muted)', fontSize: '0.9rem'}}>{step.hint}</div>
                  <Link to={step.to}>Open →</Link>
                </li>
              ))}
            </ol>

            <div className="v4-toolbar" style={{marginTop: '1.5rem', gap: '0.75rem'}}>
              {canEnterConsole ? (
                <Button type="button" onClick={() => navigate('/')}>
                  Enter dashboard
                </Button>
              ) : (
                <Button type="button" variant="secondary" disabled title="Submit KYB before using the full console">
                  Dashboard locked until KYB submitted
                </Button>
              )}
              <Link to="/merchant/kyb">
                <Button type="button" variant="secondary">
                  Review KYB
                </Button>
              </Link>
              <Link to="/security/users">
                <Button type="button" variant="secondary">
                  Security settings
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
 * Never trusts sessionStorage / localStorage / query flags.
 */
export function shouldForceOnboarding(kyb: any): boolean {
  const status = String(kyb?.onboarding_status || kyb?.status || '').toUpperCase();
  const missing = kyb?.missing || [];
  if (status === 'APPROVED' || status === 'SUBMITTED' || status === 'IN_REVIEW' || status === 'UNDER_REVIEW')
    return false;
  return status === 'DRAFT' || missing.length > 0;
}
