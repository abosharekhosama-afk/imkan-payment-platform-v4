import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, formatMoney, shortId} from '../../utils/money';

export function LedgerPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([v4.ledgerAccounts(token), v4.ledgerEntries(token)])
      .then(([a, e]) => {
        setAccounts(a);
        setEntries(e);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title={t('ledger.title')}
        description={t('ledger.description')}
        crumbs={[{label: t('section.finance')}, {label: t('nav.ledger')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>{t('ledger.accounts')}</h3>
            <DataTable
              columns={[t('ledger.colCode'), t('common.currency'), t('common.status')]}
              rows={accounts.map((a) => [a.code || a.account_code || shortId(a.id), a.currency_code, a.status || '—'])}
            />
          </div>
          <div className="v4-card">
            <h3>{t('ledger.entries')}</h3>
            <DataTable
              columns={[t('common.id'), t('common.amount'), t('common.created')]}
              rows={entries.map((e) => [
                shortId(e.id),
                formatMoney(e.amount_minor || e.debit_minor || e.credit_minor, e.currency_code),
                formatDate(e.created_at),
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
