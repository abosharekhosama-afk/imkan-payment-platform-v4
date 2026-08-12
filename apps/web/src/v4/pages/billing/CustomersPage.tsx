import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Drawer, Field, LoadingState, Modal, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {usePlatformRuntime} from '../../hooks/usePlatformRuntime';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function CustomersPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const {allowSandboxTokens} = usePlatformRuntime();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({name: '', email: '', phone: '', default_payment_method_token: ''});

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.customers(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await v4.createCustomer(token, {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        default_payment_method_token: form.default_payment_method_token || undefined,
      });
      setOpen(false);
      push(t('toast.customerCreated'));
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        crumbs={[{label: t('section.billing')}, {label: t('nav.customers')}]}
        actions={
          <Can anyOf={['customers.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              {t('customers.create')}
            </Button>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('customers.colCustomer')}</th>
                <th>{t('customers.colName')}</th>
                <th>{t('common.email')}</th>
                <th>{t('customers.colExternalId')}</th>
                <th>{t('customers.colSource')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{cursor: 'pointer'}}
                    onClick={() => setSelected(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(r);
                    }}
                    tabIndex={0}
                  >
                    <td>{shortId(r.id)}</td>
                    <td>{r.name}</td>
                    <td>{r.email || '—'}</td>
                    <td>{r.external_customer_id || '—'}</td>
                    <td>{r.source_system || '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{t('customers.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <Drawer title={selected.name || shortId(selected.id)} onClose={() => setSelected(null)}>
          <dl style={{display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem 1rem'}}>
            <dt>{t('customers.drawerId')}</dt>
            <dd>{selected.id}</dd>
            <dt>{t('common.email')}</dt>
            <dd>{selected.email || '—'}</dd>
            <dt>{t('customers.drawerPhone')}</dt>
            <dd>{selected.phone || '—'}</dd>
            <dt>{t('customers.drawerExternal')}</dt>
            <dd>{selected.external_customer_id || '—'}</dd>
            <dt>{t('customers.drawerSource')}</dt>
            <dd>{selected.source_system || '—'}</dd>
            <dt>{t('customers.drawerPmToken')}</dt>
            <dd>{selected.default_payment_method_token || '—'}</dd>
            <dt>{t('common.created')}</dt>
            <dd>{formatDate(selected.created_at)}</dd>
            <dt>{t('customers.drawerUpdated')}</dt>
            <dd>{formatDate(selected.updated_at)}</dd>
          </dl>
          <h4>{t('customers.drawerRaw')}</h4>
          <pre style={{fontSize: '0.75rem', overflow: 'auto', background: 'var(--v4-bg)', padding: '0.75rem'}}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </Drawer>
      ) : null}
      {open ? (
        <Modal title={t('customers.modalTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('common.name')}>
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label={t('common.email')}>
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />
            </Field>
            <Field label={t('customers.labelPhone')}>
              <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
            </Field>
            {allowSandboxTokens ? (
              <Field label={t('customers.labelPmToken')} hint={t('customers.pmTokenHint')}>
                <input
                  value={form.default_payment_method_token}
                  onChange={(e) => setForm({...form, default_payment_method_token: e.target.value})}
                  placeholder="tok_ok"
                />
              </Field>
            ) : (
              <Alert tone="info">{t('customers.productionAlert')}</Alert>
            )}
            <Button type="submit">{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
