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
import {useI18n} from '../i18n/I18nProvider';
import {CurrencySelect} from '../design-system/CurrencySelect';

export function PaymentLinksPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
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
        one_time: true,
        max_uses: 1,
        reusable: false,
      });
      setOpen(false);
      push(t('toast.paymentLinkCreated'));
      if (created?.public_token) {
        await navigator.clipboard?.writeText(checkoutWebUrl(created.public_token));
        push(t('toast.checkoutUrlCopied'));
      }
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('paymentLinks.title')}
        description={t('paymentLinks.description')}
        crumbs={[{label: t('section.payments')}, {label: t('nav.paymentLinks')}]}
        actions={
          <Can anyOf={['payment_links.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              {t('paymentLinks.createLink')}
            </Button>
          </Can>
        }
      />
      <Alert tone="info">{t('paymentLinks.copyHint')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('common.status')}>
          <option value="">{t('common.allStatuses')}</option>
          {['DRAFT', 'ACTIVE', 'INACTIVE', 'EXPIRED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button variant="secondary" type="button" onClick={load}>
          {t('common.refresh')}
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('paymentLinks.colLink'),
            t('paymentLinks.colTitle'),
            t('common.amount'),
            t('common.status'),
            t('common.created'),
            '',
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            r.title,
            formatMoney(r.amount_minor, r.currency_code),
            <StatusBadge status={r.status} />,
            formatDate(r.created_at),
            <Link to={`/payment-links/${r.id}`}>{t('common.open')}</Link>,
          ])}
        />
      )}
      {open ? (
        <Modal title={t('paymentLinks.modalTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label={t('paymentLinks.labelTitle')}>
              <input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} required />
            </Field>
            <Field label={t('paymentLinks.labelAmount')}>
              <input
                value={form.amount_minor}
                onChange={(e) => setForm({...form, amount_minor: e.target.value})}
                required
              />
            </Field>
            <Field label={t('common.currency')}>
              <CurrencySelect
                value={form.currency_code}
                onChange={(currency_code) => setForm({...form, currency_code})}
                required
              />
            </Field>
            <Field label={t('paymentLinks.labelDescription')}>
              <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
            </Field>
            <label style={{display: 'flex', gap: 8, marginBottom: 12}}>
              <input
                type="checkbox"
                checked={form.activate}
                onChange={(e) => setForm({...form, activate: e.target.checked})}
              />
              {t('paymentLinks.activateImmediately')}
            </label>
            <Button type="submit">{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
