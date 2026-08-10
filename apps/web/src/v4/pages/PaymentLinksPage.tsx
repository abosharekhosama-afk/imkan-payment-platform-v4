import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {checkoutWebUrl} from '../api/client';
import {v4} from '../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '../design-system/components';
import {Can} from '../rbac/Can';
import {useToast} from '../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../utils/money';

export function PaymentLinksPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: 'Demo payment',
    amount_minor: '1000',
    currency_code: 'SAR',
    description: '',
    activate: true,
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    v4.paymentLinks(token, q)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, status]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await v4.createPaymentLink(token, {
        title: form.title,
        description: form.description || undefined,
        amount_mode: 'FIXED',
        amount_minor: form.amount_minor,
        currency_code: form.currency_code,
        activate: form.activate,
      });
      setOpen(false);
      push('Payment link created');
      if (created?.public_token) {
        await navigator.clipboard?.writeText(checkoutWebUrl(created.public_token));
        push('Checkout URL copied');
      }
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Payment Links"
        description="Create hosted checkout links. Customer pays via V4 Checkout → Payment Core → Provider Router → Sandbox."
        crumbs={[{label: 'Payments'}, {label: 'Payment Links'}]}
        actions={
          <Can anyOf={['payment_links.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              Create link
            </Button>
          </Can>
        }
      />
      <Alert tone="info">
        Copy uses the web route <code>/checkout/:token</code> (not the frozen Legacy public checkout path).
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="">All statuses</option>
          {['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button variant="secondary" type="button" onClick={load}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Link', 'Title', 'Amount', 'Status', 'Created', '']}
          rows={rows.map((r) => [
            shortId(r.id),
            r.title,
            formatMoney(r.amount_minor, r.currency_code),
            <StatusBadge status={r.status} />,
            formatDate(r.created_at),
            <Link to={`/payment-links/${r.id}`}>Open</Link>,
          ])}
        />
      )}
      {open ? (
        <Modal title="Create payment link" onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="Title">
              <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} required />
            </Field>
            <Field label="Amount (minor units)">
              <input
                value={form.amount_minor}
                onChange={(e) => setForm({...form, amount_minor: e.target.value})}
                required
              />
            </Field>
            <Field label="Currency">
              <input
                value={form.currency_code}
                onChange={(e) => setForm({...form, currency_code: e.target.value.toUpperCase()})}
                maxLength={3}
                required
              />
            </Field>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
            </Field>
            <label style={{display: 'flex', gap: 8, marginBottom: 12}}>
              <input
                type="checkbox"
                checked={form.activate}
                onChange={(e) => setForm({...form, activate: e.target.checked})}
              />
              Activate immediately
            </label>
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
