import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, Modal, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';

export function PricesPage() {
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
      push('Price created');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Prices"
        description="Recurring or one-time prices attached to products."
        crumbs={[{label: 'Billing'}, {label: 'Prices'}]}
        actions={
          <Can anyOf={['prices.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)} disabled={!products.length}>
              Create price
            </Button>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Price', 'Product', 'Amount', 'Interval', 'Created']}
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
        <Modal title="Create price" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Product">
              <select value={form.product_id} onChange={(e) => setForm({...form, product_id: e.target.value})} required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (minor)">
              <input
                required
                value={form.unit_amount_minor}
                onChange={(e) => setForm({...form, unit_amount_minor: e.target.value})}
              />
            </Field>
            <Field label="Currency">
              <input
                required
                maxLength={3}
                value={form.currency_code}
                onChange={(e) => setForm({...form, currency_code: e.target.value.toUpperCase()})}
              />
            </Field>
            <Field label="Interval">
              <select value={form.interval_unit} onChange={(e) => setForm({...form, interval_unit: e.target.value})}>
                {['DAY', 'WEEK', 'MONTH', 'YEAR'].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
