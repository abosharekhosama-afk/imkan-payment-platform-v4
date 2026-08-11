import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';

/**
 * Transactions view — composed from payment detail transaction rows.
 * There is no separate /merchant/transactions list API; we surface provider txns
 * from recent payment intents (read-only composition, not invented financial data).
 */
export function TransactionsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const payments = await v4.payments(token, '?limit=25');
        const details = await Promise.all(
          payments.slice(0, 15).map((p: any) => v4.payment(token, p.id).catch(() => null)),
        );
        const txns = details.flatMap((d) =>
          (d?.transactions || []).map((txn: any) => ({
            ...txn,
            payment_intent_id: d.intent?.id,
          })),
        );
        setRows(txns);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div>
      <PageHeader
        title={t('transactions.title')}
        description={t('transactions.description')}
        crumbs={[{label: t('section.payments')}, {label: t('nav.transactions')}]}
      />
      <Alert tone="info">{t('transactions.notLedger')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
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
