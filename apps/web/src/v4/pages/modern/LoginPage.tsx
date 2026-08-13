import React, {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {Alert, Button, Field} from '../../design-system/components';
import {ApiError} from '../../api/client';
import {useI18n} from '../../i18n/I18nProvider';

export function LoginPageModern() {
  const {t, dir} = useI18n();
  const {token, login, verifyMfa, loading} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="v4-auth-split" dir={dir}>
      <section className="v4-auth-hero" aria-hidden="true">
        <div className="v4-auth-hero-brand">
          <div className="v4-brand-mark">IMK</div>
          <div>
            <h1 style={{margin: 0, fontSize: '1.1rem', fontWeight: 800}}>{t('app.name')}</h1>
            <p style={{margin: '2px 0 0', color: '#9eb0c5', fontSize: '0.78rem'}}>{t('app.console')}</p>
          </div>
        </div>
        <div>
          <h2>{t('auth.loginHeroTitle', {defaultValue: 'Payments built for growth'})}</h2>
          <p>
            {t('auth.loginHeroBody', {
              defaultValue: 'Manage links, payouts, and compliance from one secure console.',
            })}
          </p>
        </div>
        <div className="v4-auth-hero-foot">
          <span>● {t('env.sandbox')}</span>
          <span>{t('auth.loginInfo')}</span>
        </div>
      </section>
      <section className="v4-auth-panel">
        <div className="v4-card v4-login-card">
          <div className="v4-brand" style={{marginBottom: '1.25rem'}}>
            <div className="v4-brand-mark">IMK</div>
            <div>
              <h1 style={{margin: 0, fontSize: '1.35rem', fontWeight: 800}}>{t('auth.login')}</h1>
              <p style={{margin: 0, color: 'var(--v4-text-muted)'}}>{t('auth.loginSubtitle')}</p>
            </div>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <form onSubmit={onSubmit}>
            {!mfaToken ? (
              <>
                <Field label={t('common.email')}>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    autoComplete="username"
                  />
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
                <input
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                />
              </Field>
            )}
            <Button type="submit" disabled={busy} style={{width: '100%'}}>
              {busy ? t('common.pleaseWait') : mfaToken ? t('auth.verifyMfa') : t('auth.login')}
            </Button>
          </form>
          {!mfaToken ? (
            <p style={{marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem', color: 'var(--v4-text-muted)'}}>
              {t('auth.newMerchant')}{' '}
              <Link to="/signup" style={{color: 'var(--v4-accent)', fontWeight: 600}}>
                {t('auth.createAccount')}
              </Link>
              <br />
              <Link to="/forgot-password">{t('auth.forgotPassword')}</Link>
              {' · '}
              <Link to="/resend-verification">{t('auth.resendVerification')}</Link>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
