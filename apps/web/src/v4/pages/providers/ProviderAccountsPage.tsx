import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {FormSection} from '../../components/FormSection';
import {shortId} from '../../utils/money';

type Environment = 'SANDBOX' | 'LIVE';

export function ProviderAccountsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState<Environment>('SANDBOX');
  const [accountId, setAccountId] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [connectProvider, setConnectProvider] = useState('paytabs');
  const [connectName, setConnectName] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.providerAccounts(token), v4.providerRoutes(token)])
      .then(([a, r]) => {
        setAccounts(a);
        setRoutes(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  const routableAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.status === 'ACTIVE' &&
          a.environment === environment &&
          ['stripe', 'paytabs', 'bop', 'sandbox'].includes(a.provider_code),
      ),
    [accounts, environment],
  );

  useEffect(() => {
    const preferred =
      routableAccounts.find((a) => a.provider_code === 'paytabs') ||
      routableAccounts.find((a) => a.provider_code === 'stripe') ||
      routableAccounts.find((a) => a.provider_code === 'sandbox') ||
      routableAccounts[0];
    setAccountId(preferred?.id || '');
  }, [routableAccounts]);

  const activeRoute = routes.find(
    (r) => r.environment === environment && !r.currency_code && !r.payment_method_type_code && r.is_active !== false,
  );

  const connectAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled && step.mfaSecret) {
        setMfaSecretOnce(step.mfaSecret);
        push(t('providers.accounts.mfaEnrolled'));
        return;
      }
      await v4.createMerchantProviderAccount(
        token,
        {
          provider_code: connectProvider,
          environment,
          display_name: connectName || undefined,
          set_default: true,
        },
        step.stepUpToken,
      );
      push(t('providers.accounts.connected'));
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message || t('providers.accounts.routeFailed'));
    } finally {
      setBusy(false);
    }
  };

  const applyRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !accountId) return;
    setBusy(true);
    setError('');
    try {
      const step = await obtainStepUp(token, totp);
      if (step.enrolled && step.mfaSecret) {
        setMfaSecretOnce(step.mfaSecret);
        push(t('providers.accounts.mfaEnrolled'));
        return;
      }
      await v4.createProviderRoute(
        token,
        {
          environment,
          provider_account_id: accountId,
          priority: 10,
        },
        step.stepUpToken,
      );
      push(t('providers.accounts.routeSaved'));
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message || t('providers.accounts.routeFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('providers.accounts.title')}
        description={t('providers.accounts.description')}
        crumbs={[{label: t('section.providers')}, {label: t('nav.providerAccounts')}]}
      />
      <Alert tone="info">{t('providers.accounts.routingHint')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {mfaSecretOnce ? (
        <Alert tone="warning">
          {t('providers.accounts.mfaSetup')}
          <pre style={{marginTop: 8, overflow: 'auto'}}>{mfaSecretOnce}</pre>
        </Alert>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <Can anyOf={['providers.manage', 'platform.admin']}>
            <div className="v4-gateway-card">
              <FormSection title={t('providers.accounts.connect')} description={t('providers.accounts.connectHint')}>
                <form onSubmit={(e) => void connectAccount(e)} style={{display: 'contents'}}>
                  <Field label={t('providers.accounts.colProvider')}>
                    <select value={connectProvider} onChange={(e) => setConnectProvider(e.target.value)}>
                      <option value="paytabs">PayTabs (GCC)</option>
                      <option value="stripe">Stripe (international)</option>
                      <option value="bop">Bank of Palestine</option>
                      <option value="sandbox">Sandbox</option>
                    </select>
                  </Field>
                  <Field label={t('providers.accounts.colEnvironment')}>
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
                      <option value="SANDBOX">{t('env.sandbox')}</option>
                      <option value="LIVE">{t('env.live')}</option>
                    </select>
                  </Field>
                  <Field label={t('providers.accounts.displayName')}>
                    <input value={connectName} onChange={(e) => setConnectName(e.target.value)} />
                  </Field>
                  <Field label={t('security.users.labelTotp')}>
                    <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
                  </Field>
                  <div>
                    <Button type="submit" disabled={busy}>
                      {busy ? t('common.saving') : t('providers.accounts.connectSubmit')}
                    </Button>
                  </div>
                </form>
              </FormSection>
              {connectProvider === 'bop' ? <Alert tone="info">{t('providers.accounts.bopPending')}</Alert> : null}
            </div>
            <div className="v4-card" style={{marginBottom: 16}}>
              <h3>{t('providers.accounts.configure')}</h3>
              <p style={{color: 'var(--v4-text-muted)', marginTop: 0}}>{t('providers.accounts.configureHint')}</p>
              <form onSubmit={(e) => void applyRoute(e)}>
                <div style={{display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'}}>
                  <Field label={t('providers.accounts.colEnvironment')}>
                    <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)}>
                      <option value="SANDBOX">{t('env.sandbox')}</option>
                      <option value="LIVE">{t('env.live')}</option>
                    </select>
                  </Field>
                  <Field label={t('providers.accounts.colProvider')}>
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={!routableAccounts.length}>
                      {routableAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.provider_code} — {a.display_name || shortId(a.id)}
                          {a.organization_id ? '' : ` (${t('providers.accounts.platformShared')})`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('security.users.labelTotp')}>
                    <input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
                  </Field>
                </div>
                {activeRoute ? (
                  <div style={{marginTop: 12}}>
                    <Alert tone="warning">
                      {t('providers.accounts.currentRoute', {
                        provider: activeRoute.provider_code,
                        environment: activeRoute.environment,
                      })}
                    </Alert>
                  </div>
                ) : (
                  <div style={{marginTop: 12}}>
                    <Alert tone="warning">{t('providers.accounts.noRoute', {environment})}</Alert>
                  </div>
                )}
                <Button type="submit" disabled={busy || !accountId} style={{marginTop: 12}}>
                  {busy ? t('common.saving') : t('providers.accounts.applyRoute')}
                </Button>
              </form>
            </div>
          </Can>

          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>{t('providers.accounts.accounts')}</h3>
            <DataTable
              columns={[
                t('providers.accounts.colProvider'),
                t('providers.accounts.colAccount'),
                t('providers.accounts.colEnvironment'),
                t('common.status'),
                t('providers.accounts.colDefault'),
              ]}
              rows={accounts.map((a) => [
                a.provider_code || '—',
                a.display_name || shortId(a.id),
                <StatusBadge status={a.environment} />,
                <StatusBadge status={a.status} />,
                a.is_default ? t('common.yes') : t('common.no'),
              ])}
            />
          </div>

          <div className="v4-card">
            <h3>{t('providers.accounts.routes')}</h3>
            <DataTable
              columns={[
                t('providers.accounts.colProvider'),
                t('providers.accounts.colEnvironment'),
                t('providers.accounts.colPriority'),
                t('common.status'),
              ]}
              rows={routes.map((r) => [
                r.provider_code || shortId(r.id),
                <StatusBadge status={r.environment} />,
                r.priority ?? '—',
                <StatusBadge status={r.is_active === false ? 'INACTIVE' : 'ACTIVE'} />,
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
