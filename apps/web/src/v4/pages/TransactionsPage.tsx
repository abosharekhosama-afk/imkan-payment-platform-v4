import React, {useCallback, useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, DataTable, Field, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';

export function TransactionsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    const qs = new URLSearchParams({limit: '50'});
    if (status) qs.set('status', status);
    if (provider) qs.set('provider_code', provider);
    v4.transactions(token, `?${qs}`)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, status, provider]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title={t('transactions.title')}
        description={t('transactions.description')}
        crumbs={[{label: t('section.payments')}, {label: t('nav.transactions')}]}
      />
      <Alert tone="info">{t('transactions.notLedger')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card" style={{marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap'}}>
        <Field label={t('common.status')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="SUCCEEDED">SUCCEEDED</option>
            <option value="FAILED">FAILED</option>
          </select>
        </Field>
        <Field label={t('transactions.colProvider')}>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="stripe">stripe</option>
            <option value="sandbox">sandbox</option>
          </select>
        </Field>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('transactions.colTxn'),
            t('payments.colPayment'),
            t('common.status'),
            t('transactions.colProvider'),
            t('common.amount'),
            t('common.created'),
          ]}
          rows={rows.map((txn) => [
            shortId(txn.id),
            <Link to={`/payments/${txn.payment_intent_id}`}>{shortId(txn.payment_intent_id)}</Link>,
            <StatusBadge status={txn.status} />,
            txn.provider_code || '—',
            formatMoney(txn.amount_minor, txn.currency_code),
            formatDate(txn.created_at),
          ])}
        />
      )}
    </div>
  );
}
