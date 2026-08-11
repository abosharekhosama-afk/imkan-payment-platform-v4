import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';

export function WebhooksPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.providerWebhooks(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title={t('providers.webhooks.title')}
        description={t('providers.webhooks.description')}
        crumbs={[{label: t('section.providers')}, {label: t('nav.webhooks')}]}
      />
      <Alert tone="info">{t('providers.webhooks.infoLong')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('providers.webhooks.colEvent'),
            t('providers.webhooks.colProvider'),
            t('providers.webhooks.colType'),
            t('providers.webhooks.colSignature'),
            t('common.status'),
            t('providers.webhooks.colReceived'),
          ]}
          rows={rows.map((r) => [
            shortId(r.id),
            r.provider_code || '—',
            r.event_type || '—',
            r.signature_valid === true
              ? t('providers.webhooks.valid')
              : r.signature_valid === false
                ? t('providers.webhooks.invalid')
                : '—',
            <StatusBadge status={r.status} />,
            formatDate(r.received_at || r.created_at),
          ])}
        />
      )}
    </div>
  );
}
