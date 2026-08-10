import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {shortId} from '../../utils/money';

export function ProviderAccountsPage() {
  const {token} = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([v4.providerAccounts(token), v4.providerRoutes(token)])
      .then(([a, r]) => {
        setAccounts(a);
        setRoutes(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title="Provider accounts & routes"
        description="Sandbox accounts and routing configuration."
        crumbs={[{label: 'Providers'}, {label: 'Accounts & Routes'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>Accounts</h3>
            <DataTable
              columns={['Account', 'Environment', 'Status', 'Default']}
              rows={accounts.map((a) => [
                a.display_name || shortId(a.id),
                <StatusBadge status={a.environment} />,
                <StatusBadge status={a.status} />,
                a.is_default ? 'Yes' : 'No',
              ])}
            />
          </div>
          <div className="v4-card">
            <h3>Routes</h3>
            <DataTable
              columns={['Route', 'Environment', 'Priority', 'Status']}
              rows={routes.map((r) => [
                shortId(r.id),
                <StatusBadge status={r.environment} />,
                r.priority ?? '—',
                <StatusBadge status={r.status || 'ACTIVE'} />,
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
