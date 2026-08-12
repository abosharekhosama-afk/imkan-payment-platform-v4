import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, Modal, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';
import {CurrencySelect} from '../../design-system/CurrencySelect';

export function PricesPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    currency_code: 'SAR',
    unit_amount_minor: '9900',
    interval_unit: 'MONTH',
    interval_count: 1,
    nickname: '',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.prices(token), v4.products(token)])
      .then(([prices, prods]) => {
        setRows(prices);
        setProducts(prods);
        if (!form.product_id && prods[0]) setForm((f) => ({...f, product_id: prods[0].id}));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await v4.createPrice(token, {
        product_id: form.product_id,
        currency_code: form.currency_code,
        unit_amount_minor: form.unit_amount_minor,
        interval_unit: form.interval_unit,
        interval_count: form.interval_count,
        nickname: form.nickname || undefined,
      });
      setOpen(false);
      push(t('toast.priceCreated'));
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('prices.title')}
        description={t('prices.description')}
        crumbs={[{label: t('section.billing')}, {label: t('nav.prices')}]}
        actions={
          <Can anyOf={['prices.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)} disabled={!products.length}>
              {t('prices.create')}
            </Button>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('prices.colPrice'),
            t('prices.colProduct'),
            t('common.amount'),
            t('prices.colInterval'),
            t('common.created'),
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            shortId(r.product_id),
            formatMoney(r.unit_amount_minor, r.currency_code),
            r.interval_unit ? `${r.interval_count || 1} ${r.interval_unit}` : 'ONE_TIME',
            formatDate(r.created_at),
          ])}
        />
      )}
      {open ? (
        <Modal title={t('prices.modalTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('prices.labelProduct')}>
              <select value={form.product_id} onChange={(e) => setForm({...form, product_id: e.target.value})} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('prices.labelAmount')}>
              <input
                required
                value={form.unit_amount_minor}
                onChange={(e) => setForm({...form, unit_amount_minor: e.target.value})}
              />
            </Field>
            <Field label={t('common.currency')}>
              <CurrencySelect
                value={form.currency_code}
                onChange={(currency_code) => setForm({...form, currency_code})}
                required
              />
            </Field>
            <Field label={t('prices.labelInterval')}>
              <select value={form.interval_unit} onChange={(e) => setForm({...form, interval_unit: e.target.value})}>
                {['DAY', 'WEEK', 'MONTH', 'YEAR'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Button type="submit">{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
