import React, {useEffect, useState} from 'react';
import {Navigate, useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {LoadingState} from '../design-system/components';
import {isOnboardingAllowlistedPath, shouldForceOnboarding} from '../pages/OnboardingWizardPage';

/**
 * UX redirect when KYB is incomplete. Never uses sessionStorage skip.
 * Money-moving APIs enforce KYB independently via assertMerchantPaymentsAllowed.
 */
export function OnboardingGate({children}: {children: React.ReactNode}) {
  const {token, loading} = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [force, setForce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setChecking(false);
        return;
      }
      if (isOnboardingAllowlistedPath(location.pathname)) {
        setChecking(false);
        setForce(false);
        return;
      }
      try {
        const kyb = await v4.kyb(token);
        if (!cancelled) setForce(shouldForceOnboarding(kyb));
      } catch {
        // Fail closed for console surfaces: send to onboarding if KYB cannot be read.
        if (!cancelled) setForce(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, location.pathname]);

  if (loading || checking) return <LoadingState label="Checking onboarding…" />;
  if (force) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
