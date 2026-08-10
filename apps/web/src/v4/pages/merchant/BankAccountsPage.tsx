import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {formatDate, shortId} from '../../utils/money';

export function BankAccountsPage() {
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.bankAccounts(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title="Bank / payout accounts"
        description="Account metadata only. Money payouts / settlement are not available (Phase 7+)."
        crumbs={[{label: 'Merchant'}, {label: 'Bank Accounts'}]}
      />
      <Alert tone="warning">Creating accounts may require step-up authentication. Secrets are never displayed.</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Account', 'Status', 'Default', 'Created']}
          rows={rows.map((r) => [
            shortId(r.id),
            <StatusBadge status={r.status} />,
            r.is_default ? 'Yes' : 'No',
            formatDate(r.created_at),
          ])}
        />
      )}
    </div>
  );
}
