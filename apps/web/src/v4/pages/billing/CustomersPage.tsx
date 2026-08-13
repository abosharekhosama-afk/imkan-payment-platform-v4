import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Drawer, Field, LoadingState, Modal, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';
import {useBusyAction} from '../../hooks/useBusyAction';

type FormState = {
  name: string;
  email: string;
  phone: string;
  external_customer_id: string;
  source_system: string;
};

const emptyForm: FormState = {
  name: '',
  email: '',
  phone: '',
  external_customer_id: '',
  source_system: '',
};

export function CustomersPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const {busy, busyKey, run} = useBusyAction();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.customers(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const openCustomer = async (row: any) => {
    setSelected(row);
    setPayments([]);
    if (!token) return;
    setPaymentsLoading(true);
    try {
      setPayments(await v4.customerPayments(token, row.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPaymentsLoading(false);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      try {
        await v4.createCustomer(token, {
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          external_customer_id: form.external_customer_id || undefined,
          source_system: form.source_system || undefined,
        });
        setOpen(false);
        setForm(emptyForm);
        push(t('toast.customerCreated'));
        load();
      } catch (err: any) {
        setError(err.message);
      }
    }, 'create');
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    await run(async () => {
      try {
        const updated = await v4.updateCustomer(token, selected.id, {
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          external_customer_id: form.external_customer_id || null,
          source_system: form.source_system || null,
        });
        setEditOpen(false);
        setSelected(updated);
        push(t('toast.customerUpdated'));
        load();
        await openCustomer(updated);
      } catch (err: any) {
        setError(err.message);
      }
    }, 'edit');
  };

  return (
    <div>
      <PageHeader
        title={t('customers.title')}
        description={t('customers.description')}
        crumbs={[{label: t('section.customers')}, {label: t('nav.customers')}]}
        actions={
          <Can anyOf={['customers.manage', 'billing.manage']}>
            <Button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setOpen(true);
              }}
            >
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
                    onClick={() => void openCustomer(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void openCustomer(r);
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
            <dt>{t('common.created')}</dt>
            <dd>{formatDate(selected.created_at)}</dd>
          </dl>
          <Can anyOf={['customers.manage', 'billing.manage']}>
            <Button
              type="button"
              onClick={() => {
                setForm({
                  name: selected.name || '',
                  email: selected.email || '',
                  phone: selected.phone || '',
                  external_customer_id: selected.external_customer_id || '',
                  source_system: selected.source_system || '',
                });
                setEditOpen(true);
              }}
            >
              {t('customers.edit')}
            </Button>
          </Can>
          <h4 style={{marginTop: '1.25rem'}}>{t('customers.paymentsTitle')}</h4>
          {paymentsLoading ? (
            <LoadingState />
          ) : payments.length ? (
            <div className="v4-table-wrap">
              <table className="v4-table">
                <thead>
                  <tr>
                    <th>{t('customers.colPayment')}</th>
                    <th>{t('common.amount')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{shortId(p.id)}</td>
                      <td>{formatMoney(p.amount_minor, p.currency_code)}</td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{t('customers.paymentsEmpty')}</p>
          )}
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
            <Field label={t('customers.labelExternalId')} hint={t('customers.externalIdHint')}>
              <input
                value={form.external_customer_id}
                onChange={(e) => setForm({...form, external_customer_id: e.target.value})}
                placeholder="books:cust_123"
              />
            </Field>
            <Field label={t('customers.labelSource')}>
              <input
                value={form.source_system}
                onChange={(e) => setForm({...form, source_system: e.target.value})}
                placeholder="books"
              />
            </Field>
            <Button type="submit" busy={busyKey === 'create'}>{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
      {editOpen && selected ? (
        <Modal title={t('customers.modalEditTitle')} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveEdit}>
            <Field label={t('common.name')}>
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label={t('common.email')}>
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />
            </Field>
            <Field label={t('customers.labelPhone')}>
              <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
            </Field>
            <Field label={t('customers.labelExternalId')}>
              <input
                value={form.external_customer_id}
                onChange={(e) => setForm({...form, external_customer_id: e.target.value})}
              />
            </Field>
            <Field label={t('customers.labelSource')}>
              <input
                value={form.source_system}
                onChange={(e) => setForm({...form, source_system: e.target.value})}
              />
            </Field>
            <Button type="submit" busy={busyKey === 'edit'}>{t('common.save')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
