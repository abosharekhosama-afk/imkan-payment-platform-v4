import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {Select} from '../design-system/Select';
import {formatDate, formatMoney, shortId} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';

export function PaymentsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
    v4.payments(token, q)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, status]);

  return (
    <div>
      <PageHeader
        title={t('payments.title')}
        description={t('payments.description')}
        crumbs={[{label: t('section.payments')}, {label: t('common.list')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar">
        <Select
          value={status}
          onChange={setStatus}
          aria-label={t('common.status')}
          options={[
            {value: '', label: t('common.allStatuses')},
            ...['CREATED', 'REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].map(
              (s) => ({value: s, label: s}),
            ),
          ]}
        />
        <Button variant="secondary" type="button" onClick={load}>
          {t('common.refresh')}
        </Button>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('payments.colPayment'),
            t('common.status'),
            t('common.amount'),
            t('payments.colCurrency'),
            t('common.created'),
            '',
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            <StatusBadge status={r.status} />,
            formatMoney(r.amount_minor, r.currency_code),
            r.currency_code,
            formatDate(r.created_at),
            <Link to={`/payments/${r.id}`}>{t('common.details')}</Link>,
          ])}
        />
      )}
    </div>
  );
}
