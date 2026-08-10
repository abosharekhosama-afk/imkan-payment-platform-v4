import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Drawer, Field, LoadingState, Modal, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';

export function CustomersPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState({name: '', email: '', phone: '', default_payment_method_token: 'tok_ok'});

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
      push('Customer created');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Payment identities (not product catalog). Prefer side drawer for detail."
        crumbs={[{label: 'Billing'}, {label: 'Customers'}]}
        actions={
          <Can anyOf={['customers.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              Create customer
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
                <th>Customer</th>
                <th>Name</th>
                <th>Email</th>
                <th>External ID</th>
                <th>Source</th>
                <th>Created</th>
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
                  <td colSpan={6}>No customers yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <Drawer title={selected.name || shortId(selected.id)} onClose={() => setSelected(null)}>
          <dl style={{display: 'grid', gridTemplateColumns: '140px 1fr', gap: '0.5rem 1rem'}}>
            <dt>ID</dt>
            <dd>{selected.id}</dd>
            <dt>Email</dt>
            <dd>{selected.email || '—'}</dd>
            <dt>Phone</dt>
            <dd>{selected.phone || '—'}</dd>
            <dt>External customer</dt>
            <dd>{selected.external_customer_id || '—'}</dd>
            <dt>Source system</dt>
            <dd>{selected.source_system || '—'}</dd>
            <dt>PM token</dt>
            <dd>{selected.default_payment_method_token || '—'}</dd>
            <dt>Created</dt>
            <dd>{formatDate(selected.created_at)}</dd>
            <dt>Updated</dt>
            <dd>{formatDate(selected.updated_at)}</dd>
          </dl>
          <h4>Raw record</h4>
          <pre style={{fontSize: '0.75rem', overflow: 'auto', background: 'var(--v4-bg)', padding: '0.75rem'}}>
            {JSON.stringify(selected, null, 2)}
          </pre>
        </Drawer>
      ) : null}
      {open ? (
        <Modal title="Create customer" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Name">
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} />
            </Field>
            <Field label="Default sandbox payment token" hint="Used for off-session billing collection">
              <input
                value={form.default_payment_method_token}
                onChange={(e) => setForm({...form, default_payment_method_token: e.target.value})}
              />
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
