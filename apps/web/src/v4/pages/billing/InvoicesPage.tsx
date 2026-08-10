import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';

export function InvoicesPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.invoices(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const collect = async (id: string) => {
    try {
      await v4.collectInvoice(token, id);
      push('Collection attempted via Payment Core → Router → Sandbox');
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Collection never calls a provider directly from Billing."
        crumbs={[{label: 'Billing'}, {label: 'Invoices'}]}
        actions={
          <Button variant="secondary" type="button" onClick={load}>
            Refresh
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Number', 'Status', 'Total', 'Period end', 'Actions']}
          rows={rows.map((r) => [
            r.number || shortId(r.id),
            <StatusBadge status={r.status} />,
            formatMoney(r.total_minor, r.currency_code),
            formatDate(r.period_end),
            <div className="v4-toolbar" style={{margin: 0}}>
              <Link to={`/invoices/${r.id}`}>Open</Link>
              <Can anyOf={['invoices.pay', 'invoices.manage', 'billing.manage']}>
                {['OPEN', 'OVERDUE'].includes(r.status) ? (
                  <Button className="ghost" type="button" onClick={() => void collect(r.id)}>
                    Collect
                  </Button>
                ) : null}
              </Can>
            </div>,
          ])}
        />
      )}
    </div>
  );
}
