import React, {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {Alert, Button, Field} from '../design-system/components';
import {ApiError} from '../api/client';

export function LoginPage() {
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
    <div className="v4-login">
      <div className="v4-card v4-login-card">
        <div className="v4-brand" style={{marginBottom: '1.5rem'}}>
          <div className="v4-brand-mark">V4</div>
          <div>
            <h1 style={{margin: 0, fontFamily: 'var(--v4-font-display)'}}>IMKAN Payments</h1>
            <p style={{margin: 0, color: 'var(--v4-text-muted)'}}>Sign in to the V4 merchant console</p>
          </div>
        </div>
        <Alert tone="info">Active console uses PostgreSQL `/api/v1` only. Sandbox is the payment rail.</Alert>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <form onSubmit={onSubmit}>
          {!mfaToken ? (
            <>
              <Field label="Email">
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" />
              </Field>
              <Field label="Password">
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
            <Field label="MFA code">
              <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" pattern="\d{6}" required />
            </Field>
          )}
          <Button type="submit" disabled={busy} style={{width: '100%'}}>
            {busy ? 'Please wait…' : mfaToken ? 'Verify MFA' : 'Sign in'}
          </Button>
        </form>
        {!mfaToken ? (
          <p style={{marginTop: '1rem', textAlign: 'center'}}>
            New merchant? <Link to="/signup">Create an account</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
