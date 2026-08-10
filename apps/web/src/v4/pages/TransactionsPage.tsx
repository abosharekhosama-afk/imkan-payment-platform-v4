import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';

/**
 * Transactions view — composed from payment detail transaction rows.
 * There is no separate /merchant/transactions list API; we surface provider txns
 * from recent payment intents (read-only composition, not invented financial data).
 */
export function TransactionsPage() {
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
          (d?.transactions || []).map((t: any) => ({
            ...t,
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
        title="Transactions"
        description="Provider transactions linked to recent V4 payment intents (composed from GET /merchant/payments/:id)."
        crumbs={[{label: 'Payments'}, {label: 'Transactions'}]}
      />
      <Alert tone="info">Not a ledger. Refunds / settlement rows are not available.</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Txn', 'Payment', 'Status', 'Provider', 'Amount', 'Created']}
          rows={rows.map((t) => [
            shortId(t.id),
            <Link to={`/payments/${t.payment_intent_id}`}>{shortId(t.payment_intent_id)}</Link>,
            <StatusBadge status={t.status} />,
            t.provider_code || '—',
            formatMoney(t.amount_minor, t.currency_code),
            formatDate(t.created_at),
          ])}
        />
      )}
    </div>
  );
}
