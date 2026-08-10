import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';

export function PaymentsPage() {
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
        title="Payments"
        description="V4 payment intents (Payment Core). Refunds are not available."
        crumbs={[{label: 'Payments'}, {label: 'List'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['CREATED', 'REQUIRES_PAYMENT', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].map((s) => (
            <option key={s}>{s}</option>
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
          columns={['Payment', 'Status', 'Amount', 'Currency', 'Created', '']}
          rows={rows.map((r) => [
            shortId(r.id),
            <StatusBadge status={r.status} />,
            formatMoney(r.amount_minor, r.currency_code),
            r.currency_code,
            formatDate(r.created_at),
            <Link to={`/payments/${r.id}`}>Details</Link>,
          ])}
        />
      )}
    </div>
  );
}
