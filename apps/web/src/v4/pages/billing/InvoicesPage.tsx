import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function InvoicesPage() {
  const {t} = useI18n();
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
        title={t('invoices.title')}
        description={t('invoices.description')}
        crumbs={[{label: t('section.billing')}, {label: t('nav.invoices')}]}
        actions={
          <Button variant="secondary" type="button" onClick={load}>
            {t('common.refresh')}
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('invoices.colNumber'),
            t('common.status'),
            t('invoices.colTotal'),
            t('invoices.colPeriodEnd'),
            t('invoices.colActions'),
          ]}
          rows={rows.map((r) => [
            r.number || shortId(r.id),
            <StatusBadge status={r.status} />,
            formatMoney(r.total_minor, r.currency_code),
            formatDate(r.period_end),
            <div className="v4-toolbar" style={{margin: 0}}>
              <Link to={`/invoices/${r.id}`}>{t('common.open')}</Link>
              <Can anyOf={['invoices.pay', 'invoices.manage', 'billing.manage']}>
                {['OPEN', 'OVERDUE'].includes(r.status) ? (
                  <Button className="ghost" type="button" onClick={() => void collect(r.id)}>
                    {t('common.collect')}
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
