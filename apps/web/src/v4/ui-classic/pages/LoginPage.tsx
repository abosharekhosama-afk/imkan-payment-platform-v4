import React, {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {Alert, Button, Field} from '../design-system/components';
import {ApiError} from '../../api/client';
import {useI18n} from '../../i18n/I18nProvider';

export function LoginPage() {
  const {t, dir} = useI18n();
  const {token, login, verifyMfa, loading} = useAuth();
  const [email, setEmail] = useState('owner@example.com');
  const [password, setPassword] = useState('Password123!');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && token) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mfaToken) {
        await verifyMfa(mfaToken, totp);
      } else {
        const result = await login(email, password);
        if (result.mfaRequired && result.mfaToken) setMfaToken(result.mfaToken);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v4-login" dir={dir}>
      <div className="v4-card v4-login-card">
        <div className="v4-brand" style={{marginBottom: '1.5rem'}}>
          <div className="v4-brand-mark">V4</div>
          <div>
            <h1 style={{margin: 0}}>{t('app.name')}</h1>
            <p style={{margin: 0, color: 'var(--v4-text-muted)'}}>{t('auth.loginSubtitle')}</p>
          </div>
        </div>
        <Alert tone="info">{t('auth.loginInfo')}</Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <form onSubmit={onSubmit}>
          {!mfaToken ? (
            <>
              <Field label={t('common.email')}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" />
              </Field>
              <Field label={t('auth.password')}>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </Field>
            </>
          ) : (
            <Field label={t('auth.mfaCode')}>
              <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" pattern="\d{6}" required />
            </Field>
          )}
          <Button type="submit" disabled={busy} style={{width: '100%'}}>
            {busy ? t('common.pleaseWait') : mfaToken ? t('auth.verifyMfa') : t('auth.login')}
          </Button>
        </form>
        {!mfaToken ? (
          <p style={{marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem'}}>
            {t('auth.newMerchant')} <Link to="/signup">{t('auth.createAccount')}</Link>
            <br />
            <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
            {' · '}
            <Link to="/resend-verification">{t('auth.resendVerification')}</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
