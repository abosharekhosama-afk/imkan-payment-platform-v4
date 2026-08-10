import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';

export function DashboardPage() {
  const {token, hasPermission} = useAuth();
  const [data, setData] = useState<any>(null);
  const [kyb, setKyb] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    if (hasPermission('payments.read')) {
      v4.dashboardSummary(token)
        .then(setData)
        .catch((e) => setError(e.message));
    }
    if (hasPermission('kyb.read', 'merchant.read')) {
      v4.kyb(token)
        .then(setKyb)
        .catch(() => setKyb(null));
    }
  }, [token, hasPermission]);

  if (!hasPermission('payments.read') && !hasPermission('kyb.read', 'merchant.read')) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Welcome to the V4 console." />
        <Alert>You do not have payments.read — payment metrics are hidden.</Alert>
      </div>
    );
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (hasPermission('payments.read') && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Aggregates from V4 payment intents. Ledger balances appear only when Financial Core APIs are available."
        crumbs={[{label: 'Overview'}, {label: 'Dashboard'}]}
      />
      <Alert tone="warning">
        Environment: <strong>SANDBOX</strong>. Live providers require <strong>DEC-009</strong>. Do not treat payment
        volume as ledger balances.
      </Alert>

      {kyb ? (
        <div className="v4-card" style={{marginBottom: '1rem'}}>
          <h3 style={{marginTop: 0}}>Onboarding / KYB</h3>
          <p style={{margin: '0 0 0.5rem'}}>
            Status: <StatusBadge status={kyb.onboarding_status || kyb.status} /> · Missing requirements:{' '}
            {(kyb.missing || []).length}
          </p>
          <Link to="/onboarding">Open onboarding wizard</Link>
          {' · '}
          <Link to="/merchant/kyb">KYB details</Link>
        </div>
      ) : null}

      <div className="v4-card" style={{marginBottom: '1rem'}}>
        <h3 style={{marginTop: 0}}>Balances</h3>
        <p style={{color: 'var(--v4-text-muted)', margin: 0}}>
          Available / pending / reserved balances are not calculated in the browser. They appear after Financial Core
          ledger APIs are enabled.
        </p>
        <p style={{marginTop: '0.75rem'}}>
          <Link to="/balances">Open balances</Link>
        </p>
      </div>

      {data ? (
        <>
          <div className="v4-stat-grid">
            {[
              ['Total payments', data.total_count],
              ['Succeeded', data.succeeded_count],
              ['Failed', data.failed_count],
              ['Pending', data.pending_count],
              ['Cancelled', data.cancelled_count],
              [
                'Succeeded volume',
                formatMoney(data.succeeded_volume_minor, data.currency_breakdown?.[0]?.currency_code || 'SAR'),
              ],
            ].map(([label, value]) => (
              <div className="v4-stat" key={String(label)}>
                <span>{label}</span>
                <strong>{value as any}</strong>
              </div>
            ))}
          </div>
          <div className="v4-card">
            <h3 style={{marginTop: 0}}>Recent payments</h3>
            <div className="v4-table-wrap">
              <table className="v4-table">
                <thead>
                  <tr>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recent_payments || []).map((p: any) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/payments/${p.id}`}>{shortId(p.id)}</Link>
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td>{formatMoney(p.amount_minor, p.currency_code)}</td>
                      <td>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
