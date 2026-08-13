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
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';
import {useBusyAction} from '../../hooks/useBusyAction';

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
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const {busy, busyKey, run} = useBusyAction();
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
    await run(async () => {
      try {
        const result = await obtainStepUp(token, totp);
        if (result.enrolled) {
          setMfaSecretOnce(result.mfaSecret || null);
          setError(t('common.mfaEnrolled'));
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
    }, 'create');
  };

  const revoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeId) return;
    setError('');
    await run(async () => {
      try {
        const result = await obtainStepUp(token, totp);
        if (result.enrolled) {
          setMfaSecretOnce(result.mfaSecret || null);
          setError(t('common.mfaEnrolled'));
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
    }, 'revoke');
  };

  return (
    <div>
      <PageHeader
        title={t('developers.apiKeys.title')}
        description={t('developers.apiKeys.descriptionLong')}
        crumbs={[{label: t('section.developers')}, {label: t('nav.apiKeys')}]}
        actions={
          <Can anyOf={['api_keys.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              {t('developers.apiKeys.createKey')}
            </Button>
          </Can>
        }
      />
      <Alert tone="info">{t('developers.apiKeys.sandboxAlert')}</Alert>
      {mfaSecretOnce ? (
        <Alert tone="warning">
          {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
        </Alert>
      ) : null}
      {secretOnce ? (
        <Alert tone="warning">
          {t('developers.apiKeys.secretCopy')} <code>{secretOnce}</code>
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
              {t('developers.apiKeys.copyDismiss')}
            </Button>
          </div>
        </Alert>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('developers.apiKeys.colKey'),
            t('common.name'),
            t('developers.apiKeys.colPrefix'),
            t('developers.apiKeys.colEnv'),
            t('common.status'),
            t('developers.apiKeys.colLastUsed'),
            '',
          ]}
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
                  {t('developers.apiKeys.revoke')}
                </Button>
              ) : (
                '—'
              )}
            </Can>,
          ])}
        />
      )}
      {open ? (
        <Modal title={t('developers.apiKeys.modalCreate')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('common.name')}>
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label={t('developers.apiKeys.labelEnvironment')}>
              <select value={form.environment} onChange={(e) => setForm({...form, environment: e.target.value})}>
                <option value="SANDBOX">SANDBOX</option>
                <option value="LIVE">{t('developers.apiKeys.liveOption')}</option>
              </select>
            </Field>
            <Field label={t('developers.apiKeys.labelScopes')}>
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
            <Field label={t('developers.apiKeys.labelTotp')} hint={t('developers.apiKeys.totpHint')}>
              <input
                required
                data-testid="api-key-totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </Field>
            <Button type="submit" busy={busyKey === 'create'}>{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
      {revokeId ? (
        <Modal title={t('developers.apiKeys.modalRevoke')} onClose={() => setRevokeId(null)}>
          <form onSubmit={revoke}>
            <p>{t('developers.apiKeys.revokeWarning')}</p>
            <Field label={t('developers.apiKeys.labelTotp')}>
              <input
                required
                data-testid="api-key-revoke-totp"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="danger" busy={busyKey === 'revoke'}>
              {t('developers.apiKeys.revoke')}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
