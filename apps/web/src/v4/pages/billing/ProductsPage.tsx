import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, Modal, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';

export function ProductsPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({name: 'Pro Plan', product_type: 'SUBSCRIPTION' as const});

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.products(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await v4.createProduct(token, form);
      setOpen(false);
      push('Product created');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Products"
        description="Catalog products for billing."
        crumbs={[{label: 'Billing'}, {label: 'Products'}]}
        actions={
          <Can anyOf={['products.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              Create product
            </Button>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Product', 'Name', 'Type', 'Status', 'Created']}
          rows={rows.map((r) => [
            shortId(r.id),
            r.name,
            r.product_type,
            <StatusBadge status={r.status || 'ACTIVE'} />,
            formatDate(r.created_at),
          ])}
        />
      )}
      {open ? (
        <Modal title="Create product" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Name">
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label="Type">
              <select
                value={form.product_type}
                onChange={(e) => setForm({...form, product_type: e.target.value as 'SUBSCRIPTION'})}
              >
                <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                <option value="ONE_TIME">ONE_TIME</option>
              </select>
            </Field>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
