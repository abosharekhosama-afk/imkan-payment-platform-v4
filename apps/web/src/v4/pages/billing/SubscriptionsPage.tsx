import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
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
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {usePlatformRuntime} from '../../hooks/usePlatformRuntime';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function SubscriptionsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const {allowSandboxTokens} = usePlatformRuntime();
  const [rows, setRows] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [prices, setPrices] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);
  const [form, setForm] = useState({customer_id: '', price_id: '', payment_method_token: ''});

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.subscriptions(token), v4.customers(token), v4.prices(token)])
      .then(([subs, custs, prcs]) => {
        setRows(subs);
        setCustomers(custs);
        setPrices(prcs);
        setForm((f) => ({
          ...f,
          customer_id: f.customer_id || custs[0]?.id || '',
          price_id: f.price_id || prcs[0]?.id || '',
        }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await v4.createSubscription(token, form);
      setOpen(false);
      push('Subscription created');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const runRenewals = async (e: React.FormEvent) => {
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
      const r = await v4.runRenewals(token, result.stepUpToken);
      push(`Renewals run: processed ${Array.isArray(r?.processed) ? r.processed.length : r?.processed ?? 'ok'}`);
      setRenewOpen(false);
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('subscriptions.title')}
        description={t('subscriptions.description')}
        crumbs={[{label: t('section.billing')}, {label: t('nav.subscriptions')}]}
        actions={
          <>
            <Can anyOf={['billing.manage']}>
              <Button variant="secondary" type="button" onClick={() => setRenewOpen(true)}>
                {t('subscriptions.runRenewals')}
              </Button>
            </Can>
            <Can anyOf={['subscriptions.manage', 'billing.manage']}>
              <Button type="button" onClick={() => setOpen(true)} disabled={!customers.length || !prices.length}>
                {t('subscriptions.create')}
              </Button>
            </Can>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('subscriptions.colSubscription'),
            t('common.status'),
            t('subscriptions.colCustomer'),
            t('subscriptions.colNextBilling'),
            '',
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            <StatusBadge status={r.status} />,
            shortId(r.customer_id),
            formatDate(r.next_billing_at),
            <Link to={`/subscriptions/${r.id}`}>{t('common.open')}</Link>,
          ])}
        />
      )}
      {open ? (
        <Modal title={t('subscriptions.modalCreate')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('subscriptions.labelCustomer')}>
              <select
                required
                value={form.customer_id}
                onChange={(e) => setForm({...form, customer_id: e.target.value})}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email || c.id.slice(0, 8)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('subscriptions.labelPrice')}>
              <select required value={form.price_id} onChange={(e) => setForm({...form, price_id: e.target.value})}>
                {prices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nickname || p.id.slice(0, 8)} — {p.unit_amount_minor} {p.currency_code}
                  </option>
                ))}
              </select>
            </Field>
            {allowSandboxTokens ? (
              <Field label={t('subscriptions.labelPmToken')}>
                <input
                  value={form.payment_method_token}
                  onChange={(e) => setForm({...form, payment_method_token: e.target.value})}
                  placeholder="tok_ok"
                />
              </Field>
            ) : (
              <Alert tone="info">{t('subscriptions.productionTokenAlert')}</Alert>
            )}
            <Button type="submit">{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
      {renewOpen ? (
        <Modal title={t('subscriptions.modalRenewals')} onClose={() => setRenewOpen(false)}>
          <form onSubmit={runRenewals}>
            {mfaSecretOnce ? (
              <Alert tone="info">
                {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
              </Alert>
            ) : null}
            <Field label={t('subscriptions.labelTotp')} hint={t('subscriptions.totpHint')}>
              <input
                data-testid="renewals-totp"
                value={totp}
                onChange={(e) => setTotp(e.target.value)}
                required
                inputMode="numeric"
              />
            </Field>
            <Button type="submit">{t('subscriptions.confirmRenewals')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
