import React, {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, Field} from '../design-system/components';
import {ApiError} from '../api/client';
import {useI18n} from '../i18n/I18nProvider';

const COUNTRIES = [
  {code: 'SA', label: 'Saudi Arabia'},
  {code: 'AE', label: 'United Arab Emirates'},
  {code: 'BH', label: 'Bahrain'},
  {code: 'KW', label: 'Kuwait'},
  {code: 'OM', label: 'Oman'},
  {code: 'QA', label: 'Qatar'},
  {code: 'EG', label: 'Egypt'},
  {code: 'JO', label: 'Jordan'},
  {code: 'GB', label: 'United Kingdom'},
  {code: 'US', label: 'United States'},
];

export function SignupPage() {
  const {t} = useI18n();
  const {token, loading} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [country, setCountry] = useState('SA');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (!loading && token) return <Navigate to="/onboarding" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (password.length < 10) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (!terms || !privacy) {
      setError(t('auth.mustAcceptTerms'));
      return;
    }
    setBusy(true);
    try {
      const res = await v4.register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        organization_name: organizationName.trim(),
        country_code: country,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v4-login">
      <div className="v4-card v4-login-card" style={{maxWidth: 480}}>
        <div className="v4-brand" style={{marginBottom: '1.5rem'}}>
          <div className="v4-brand-mark">V4</div>
          <div>
            <h1 style={{margin: 0, fontFamily: 'var(--v4-font-display)'}}>{t('auth.signup')}</h1>
            <p style={{margin: 0, color: 'var(--v4-text-muted)'}}>{t('auth.signupSubtitle')}</p>
          </div>
        </div>

        {result ? (
          <>
            <Alert tone="success">
              {t('auth.signupSuccess', {email: result.email})} {t('auth.signupSuccessDetail')}
            </Alert>
            {result.email_verification_token ? (
              <Alert tone="info">{t('auth.signupDevTokenHidden')}</Alert>
            ) : (
              <Alert tone="info">
                {t('auth.signupCheckSpam')}{' '}
                <Link to="/resend-verification">{t('auth.resendVerification')}</Link>.
              </Alert>
            )}
            {result.email_verification_token ? (
              <Field label={t('auth.devToken')}>
                <input readOnly value={result.email_verification_token} />
              </Field>
            ) : null}
            <p style={{fontSize: '0.9rem', color: 'var(--v4-text-muted)'}}>
              {t('auth.signupOrgInfo', {slug: result.organization_slug, id: result.organization_id})}
            </p>
            <Link to="/login">
              <Button type="button" style={{width: '100%'}}>
                {t('auth.continueToSignIn')}
              </Button>
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label={t('auth.workEmail')}>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t('auth.fullName')}>
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label={t('auth.orgName')}>
              <input
                required
                minLength={2}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </Field>
            <Field label={t('auth.country')}>
              <select value={country} onChange={(e) => setCountry(e.target.value)} required>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label={t('auth.confirmPassword')}>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <label style={{display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.75rem'}}>
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>{t('auth.acceptTerms')}</span>
            </label>
            <label style={{display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1rem'}}>
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>{t('auth.acceptPrivacy')}</span>
            </label>
            <Button type="submit" disabled={busy} style={{width: '100%'}}>
              {busy ? t('auth.creatingAccount') : t('auth.signup')}
            </Button>
            <p style={{marginTop: '1rem', textAlign: 'center'}}>
              {t('auth.alreadyHaveAccount')}{' '}
              <Link to="/login">{t('auth.login')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
