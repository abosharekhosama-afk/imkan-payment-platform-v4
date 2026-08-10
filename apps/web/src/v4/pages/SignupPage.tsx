import React, {useState} from 'react';
import {Link, Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, Field} from '../design-system/components';
import {ApiError} from '../api/client';

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
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (!terms || !privacy) {
      setError('You must accept the Terms and Privacy Policy.');
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
            <h1 style={{margin: 0, fontFamily: 'var(--v4-font-display)'}}>Create account</h1>
            <p style={{margin: 0, color: 'var(--v4-text-muted)'}}>
              Start merchant onboarding — you will not land on an empty dashboard.
            </p>
          </div>
        </div>

        {result ? (
          <>
            <Alert tone="success">
              Account created for <strong>{result.email}</strong>. Verify your email, then sign in to continue
              onboarding.
            </Alert>
            <Alert tone="warning">
              Production email delivery is <strong>BLOCKED BY: DEC-017</strong>. In development, use the verification
              token below if exposed.
            </Alert>
            {result.email_verification_token ? (
              <Field label="Dev email verification token">
                <input readOnly value={result.email_verification_token} />
              </Field>
            ) : null}
            <p style={{fontSize: '0.9rem', color: 'var(--v4-text-muted)'}}>
              Organization: {result.organization_slug} · ID: {result.organization_id}
            </p>
            <Link to="/login">
              <Button type="button" style={{width: '100%'}}>
                Continue to sign in
              </Button>
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <Field label="Work email">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Full name">
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Organization / company name">
              <input
                required
                minLength={2}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </Field>
            <Field label="Country">
              <select value={country} onChange={(e) => setCountry(e.target.value)} required>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Password" hint="At least 10 characters">
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm password">
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
              <span>I accept the Terms of Service</span>
            </label>
            <label style={{display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1rem'}}>
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
              <span>I accept the Privacy Policy</span>
            </label>
            <Button type="submit" disabled={busy} style={{width: '100%'}}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
            <p style={{marginTop: '1rem', textAlign: 'center'}}>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
