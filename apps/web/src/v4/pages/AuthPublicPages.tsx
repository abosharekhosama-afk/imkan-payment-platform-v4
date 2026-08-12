import React, {useEffect, useState} from 'react';
import {Link, useSearchParams} from 'react-router-dom';
import {v4} from '../api/endpoints';
import {Alert, Button, Field, LoadingState} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';

export function VerifyEmailPage() {
  const {t} = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('auth.missingVerifyToken'));
      return;
    }
    setStatus('busy');
    v4
      .verifyEmail({token})
      .then(() => {
        setStatus('ok');
        setMessage(t('auth.emailVerified'));
      })
      .catch((e: Error) => {
        setStatus('error');
        setMessage(e.message);
      });
  }, [token, t]);

  return (
    <AuthPublicShell title={t('auth.verifyEmail')}>
      {status === 'busy' ? <LoadingState label={t('auth.verifying')} /> : null}
      {status === 'ok' ? <Alert tone="success">{message}</Alert> : null}
      {status === 'error' ? <Alert tone="danger">{message}</Alert> : null}
      <p>
        <Link to="/login">{t('common.backToLogin')}</Link>
      </p>
    </AuthPublicShell>
  );
}

export function ResetPasswordPage() {
  const {t} = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'form' | 'busy' | 'ok' | 'error'>('form');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus('error');
      setMessage(t('auth.missingResetToken'));
      return;
    }
    setStatus('busy');
    try {
      await v4.resetPassword({token, password});
      setStatus('ok');
      setMessage(t('auth.passwordUpdated'));
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  if (!token) {
    return (
      <AuthPublicShell title={t('auth.resetPassword')}>
        <Alert tone="danger">{t('auth.missingResetToken')}</Alert>
      </AuthPublicShell>
    );
  }

  return (
    <AuthPublicShell title={t('auth.resetPassword')}>
      {status === 'ok' ? <Alert tone="success">{message}</Alert> : null}
      {status === 'error' ? <Alert tone="danger">{message}</Alert> : null}
      {status === 'form' || status === 'busy' ? (
        <form onSubmit={submit}>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>
            <input
              type="password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={status === 'busy'}>
            {status === 'busy' ? t('auth.saving') : t('auth.updatePassword')}
          </Button>
        </form>
      ) : null}
      <p>
        <Link to="/login">{t('common.backToLogin')}</Link>
      </p>
    </AuthPublicShell>
  );
}

export function AcceptInvitationPage() {
  const {t} = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [form, setForm] = useState({name: '', password: ''});
  const [status, setStatus] = useState<'form' | 'busy' | 'ok' | 'error'>('form');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setStatus('error');
      setMessage(t('auth.missingInviteToken'));
      return;
    }
    setStatus('busy');
    try {
      await v4.acceptInvitation({token, name: form.name, password: form.password});
      setStatus('ok');
      setMessage(t('auth.inviteAccepted'));
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  if (!token) {
    return (
      <AuthPublicShell title={t('auth.acceptInvitation')}>
        <Alert tone="danger">{t('auth.missingInviteToken')}</Alert>
      </AuthPublicShell>
    );
  }

  return (
    <AuthPublicShell title={t('auth.acceptInvitation')}>
      {status === 'ok' ? <Alert tone="success">{message}</Alert> : null}
      {status === 'error' ? <Alert tone="danger">{message}</Alert> : null}
      {status === 'form' || status === 'busy' ? (
        <form onSubmit={submit}>
          <Field label={t('auth.yourName')}>
            <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
          </Field>
          <Field label={t('auth.password')} hint={t('auth.passwordHint')}>
            <input
              type="password"
              required
              minLength={10}
              value={form.password}
              onChange={(e) => setForm({...form, password: e.target.value})}
            />
          </Field>
          <Button type="submit" disabled={status === 'busy'}>
            {status === 'busy' ? t('auth.joining') : t('auth.acceptInvitation')}
          </Button>
        </form>
      ) : null}
      <p>
        <Link to="/login">{t('common.backToLogin')}</Link>
      </p>
    </AuthPublicShell>
  );
}

export function ForgotPasswordPage() {
  const {t} = useI18n();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'form' | 'busy' | 'ok' | 'error'>('form');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('busy');
    try {
      await v4.forgotPassword({email: email.trim()});
      setStatus('ok');
      setMessage(t('auth.forgotPasswordSuccess'));
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  return (
    <AuthPublicShell title={t('auth.forgotPasswordTitle')}>
      {status === 'ok' ? <Alert tone="success">{message}</Alert> : null}
      {status === 'error' ? <Alert tone="danger">{message}</Alert> : null}
      {status === 'form' || status === 'busy' ? (
        <form onSubmit={submit}>
          <Field label={t('common.email')}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" disabled={status === 'busy'}>
            {status === 'busy' ? t('auth.sending') : t('auth.sendResetLink')}
          </Button>
        </form>
      ) : null}
      <p>
        <Link to="/login">{t('common.backToLogin')}</Link>
      </p>
    </AuthPublicShell>
  );
}

export function ResendVerificationPage() {
  const {t} = useI18n();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'form' | 'busy' | 'ok' | 'error'>('form');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('busy');
    try {
      const res = await v4.resendVerification({email: email.trim()});
      let msg = t('auth.resendSuccess');
      if (res?.token) msg += t('auth.resendDevToken', {token: res.token});
      setMessage(msg);
      setStatus('ok');
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  return (
    <AuthPublicShell title={t('auth.resendVerificationTitle')}>
      {status === 'ok' ? <Alert tone="success">{message || t('auth.requestAccepted')}</Alert> : null}
      {status === 'error' ? <Alert tone="danger">{message}</Alert> : null}
      {status === 'form' || status === 'busy' ? (
        <form onSubmit={submit}>
          <Field label={t('common.email')}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" disabled={status === 'busy'}>
            {status === 'busy' ? t('auth.sending') : t('auth.resendVerificationEmail')}
          </Button>
        </form>
      ) : null}
      <p>
        <Link to="/login">{t('common.backToLogin')}</Link>
      </p>
    </AuthPublicShell>
  );
}

export function CheckoutReturnPage() {
  const {t} = useI18n();
  const [params] = useSearchParams();
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState('');

  const rawStatus = (params.get('status') || params.get('redirect_status') || '').toLowerCase();
  const stripePi = params.get('payment_intent') || '';

  const normalized =
    rawStatus === 'success' || rawStatus === 'succeeded' || rawStatus === 'complete'
      ? 'success'
      : rawStatus === 'cancel' || rawStatus === 'cancelled' || rawStatus === 'canceled'
        ? 'cancel'
        : rawStatus === 'failed' || rawStatus === 'requires_payment_method'
          ? 'failed'
          : stripePi
            ? 'pending'
            : 'unknown';

  useEffect(() => {
    if (!stripePi || !stripePi.startsWith('pi_')) return;
    let cancelled = false;
    v4
      .checkoutStripeSync({payment_intent: stripePi})
      .then((row) => {
        if (cancelled) return;
        const st = String(row.status || '').toUpperCase();
        setSyncStatus(st.includes('SUCCEED') ? 'success' : st.includes('FAIL') ? 'failed' : st.includes('CANCEL') ? 'cancel' : null);
      })
      .catch((e) => {
        if (!cancelled) setSyncError(e.message || 'sync failed');
      });
    return () => {
      cancelled = true;
    };
  }, [stripePi]);

  const status = syncStatus || normalized;
  const tone = status === 'success' ? 'success' : status === 'cancel' || status === 'failed' ? 'warning' : 'info';
  const statusText =
    status === 'success'
      ? t('checkout.completed')
      : status === 'cancel'
        ? t('checkout.cancelled')
        : status === 'failed'
          ? t('checkout.failed')
          : status === 'pending'
            ? t('checkout.confirming')
            : t('checkout.unknown');

  return (
    <AuthPublicShell title={t('checkout.returnTitle')}>
      <Alert tone={tone}>{statusText}.</Alert>
      {syncError ? <Alert tone="warning">{syncError}</Alert> : null}
      <p>{t('checkout.closeWindow')}</p>
    </AuthPublicShell>
  );
}

function AuthPublicShell({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <div className="v4-checkout">
      <div className="v4-checkout-card" style={{maxWidth: 480, margin: '4rem auto'}}>
        <h1 style={{marginTop: 0, fontFamily: 'var(--v4-font-display)'}}>{title}</h1>
        {children}
      </div>
    </div>
  );
}
