import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {shortId} from '../../utils/money';

export function ProviderAccountsPage() {
  const {t} = useI18n();
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
        title={t('providers.accounts.title')}
        description={t('providers.accounts.description')}
        crumbs={[{label: t('section.providers')}, {label: t('nav.providerAccounts')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3>{t('providers.accounts.accounts')}</h3>
            <DataTable
              columns={[
                t('providers.accounts.colAccount'),
                t('providers.accounts.colEnvironment'),
                t('common.status'),
                t('providers.accounts.colDefault'),
              ]}
              rows={accounts.map((a) => [
                a.display_name || shortId(a.id),
                <StatusBadge status={a.environment} />,
                <StatusBadge status={a.status} />,
                a.is_default ? t('common.yes') : t('common.no'),
              ])}
            />
          </div>
          <div className="v4-card">
            <h3>{t('providers.accounts.routes')}</h3>
            <DataTable
              columns={[
                t('providers.accounts.colRoute'),
                t('providers.accounts.colEnvironment'),
                t('providers.accounts.colPriority'),
                t('common.status'),
              ]}
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
