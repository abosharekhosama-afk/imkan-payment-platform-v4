import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, Field, LoadingState, Modal, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';
import {useBusyAction} from '../../hooks/useBusyAction';

export function ProductsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const {busy, run} = useBusyAction();
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
    await run(async () => {
      try {
        await v4.createProduct(token, form);
        setOpen(false);
        push(t('toast.productCreated'));
        load();
      } catch (err: any) {
        setError(err.message);
      }
    });
  };

  return (
    <div>
      <PageHeader
        title={t('products.title')}
        description={t('products.description')}
        crumbs={[{label: t('section.billing')}, {label: t('nav.products')}]}
        actions={
          <Can anyOf={['products.manage', 'billing.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              {t('products.create')}
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
            t('products.colProduct'),
            t('common.name'),
            t('products.colType'),
            t('common.status'),
            t('common.created'),
          ]}
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
        <Modal title={t('products.modalTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('common.name')}>
              <input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
            </Field>
            <Field label={t('products.labelType')}>
              <select
                value={form.product_type}
                onChange={(e) => setForm({...form, product_type: e.target.value as 'SUBSCRIPTION'})}
              >
                <option value="SUBSCRIPTION">SUBSCRIPTION</option>
                <option value="ONE_TIME">ONE_TIME</option>
              </select>
            </Field>
            <Button type="submit" busy={busy}>{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
