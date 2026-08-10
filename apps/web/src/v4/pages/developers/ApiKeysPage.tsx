import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {ApiError} from '../../api/client';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';

const SCOPE_OPTIONS = [
  'payments.read',
  'payments.manage',
  'payment_links.read',
  'payment_links.manage',
  'providers.read',
  'webhooks.read',
  'customers.read',
  'customers.manage',
  'products.read',
  'products.manage',
  'prices.read',
  'prices.manage',
  'subscriptions.read',
  'subscriptions.manage',
  'invoices.read',
  'invoices.manage',
  'billing.manage',
];

async function obtainStepUp(
  token: string | null,
  totp: string,
): Promise<{stepUpToken?: string; mfaSecret?: string; enrolled?: boolean}> {
  try {
    const step = await v4.stepUp(token, totp);
    return {stepUpToken: step.step_up_token as string};
  } catch (err) {
    const code = err instanceof ApiError ? err.code : '';
    if (code === 'MFA_REQUIRED_FOR_STEP_UP' || /MFA must be enabled/i.test(String((err as Error).message))) {
      const enabled = await v4.enableMfa(token);
      return {enrolled: true, mfaSecret: enabled.secret as string};
    }
    throw err;
  }
}

export function ApiKeysPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [totp, setTotp] = useState('');
  const [form, setForm] = useState({name: 'Server key', environment: 'SANDBOX', scopes: ['payments.read'] as string[]});

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.apiKeys(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await obtainStepUp(token, totp);
      if (result.enrolled) {
        setMfaSecretOnce(result.mfaSecret || null);
        setError('MFA enrolled — enter a TOTP from your authenticator and submit again.');
        setTotp('');
        return;
      }
      const created = await v4.createApiKey(token, form, result.stepUpToken);
      setSecretOnce(created.secret || null);
      setOpen(false);
      setTotp('');
      push('API key created — copy the secret now');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const revoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeId) return;
    setError('');
    try {
      const result = await obtainStepUp(token, totp);
      if (result.enrolled) {
        setMfaSecretOnce(result.mfaSecret || null);
        setError('MFA enrolled — enter a TOTP from your authenticator and submit again.');
        setTotp('');
        return;
      }
      await v4.revokeApiKey(token, revokeId, result.stepUpToken);
      push('API key revoked');
      setRevokeId(null);
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Hashed secrets. Plaintext shown once. Create/revoke require MFA step-up."
        crumbs={[{label: 'Developers'}, {label: 'API Keys'}]}
        actions={
          <Can anyOf={['api_keys.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              Create key
            </Button>
          </Can>
        }
      />
      <Alert tone="info">SANDBOX by default. LIVE keys do not enable a live payment rail.</Alert>
      {mfaSecretOnce ? (
        <Alert tone="warning">
          MFA secret (enroll in authenticator): <code>{mfaSecretOnce}</code>
        </Alert>
      ) : null}
      {secretOnce ? (
        <Alert tone="warning">
          Secret (copy now — will not be shown again): <code>{secretOnce}</code>
          <div style={{marginTop: 8}}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(secretOnce);
                push('Secret copied');
                setSecretOnce(null);
              }}
            >
              Copy & dismiss
            </Button>
          </div>
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Key', 'Name', 'Prefix', 'Env', 'Status', 'Last used', '']}
          rows={rows.map((r) => [
            shortId(r.id),
            r.name,
            r.prefix,
            <StatusBadge status={r.environment} />,
            <StatusBadge status={r.status} />,
            formatDate(r.last_used_at),
            <Can anyOf={['api_keys.manage']}>
              {r.status !== 'REVOKED' ? (
                <Button
                  variant="danger"
                  type="button"
                  onClick={() => {
                    setRevokeId(r.id);
                    setTotp('');
                  }}
                >
                  Revoke
                </Button>
              ) : (
                '—'
              )}
            </Can>,
          ])}
        />
      )}
      {open ? (
        <Modal title="Create API key" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Name">
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label="Environment">
              <select value={form.environment} onChange={(e) => setForm({...form, environment: e.target.value})}>
                <option value="SANDBOX">SANDBOX</option>
                <option value="LIVE">LIVE (not a live payment rail)</option>
              </select>
            </Field>
            <Field label="Scopes">
              <select
                multiple
                size={8}
                value={form.scopes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scopes: Array.from(e.target.selectedOptions).map((o) => o.value),
                  })
                }
              >
                {SCOPE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Step-up TOTP" hint="6-digit MFA code">
              <input
                required
                data-testid="api-key-totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      ) : null}
      {revokeId ? (
        <Modal title="Revoke API key" onClose={() => setRevokeId(null)}>
          <form onSubmit={revoke}>
            <p>This cannot be undone. Integrations using the key will fail.</p>
            <Field label="Step-up TOTP">
              <input
                required
                data-testid="api-key-revoke-totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="danger">
              Revoke
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
