import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';

export function ProvidersPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [caps, setCaps] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.providers(token)
      .then(async (providers) => {
        setRows(providers);
        const sandbox = providers.find((p: any) => p.code === 'sandbox');
        if (sandbox) setCaps(await v4.providerCapabilities(token, sandbox.code));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title={t('providers.title')}
        description={t('providers.description')}
        crumbs={[{label: t('section.providers')}, {label: t('nav.providers')}]}
      />
      <Alert tone="warning">{t('providers.noExternalLong')}</Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={[
              t('providers.colCode'),
              t('providers.colName'),
              t('common.status'),
              t('providers.colSandbox'),
              t('providers.colLive'),
            ]}
            rows={rows.map((r) => [
              r.code,
              r.name,
              <StatusBadge status={r.status} />,
              r.supports_sandbox ? <StatusBadge status="SANDBOX" /> : '—',
              r.supports_live ? <StatusBadge status="LIVE" /> : <StatusBadge status="DISABLED" />,
            ])}
          />
          <div className="v4-card" style={{marginTop: 16}}>
            <h3>{t('providers.capabilities')}</h3>
            <DataTable
              columns={[
                t('providers.colCapability'),
                t('providers.colEvidence'),
                t('providers.colScope'),
                t('providers.colNotes'),
              ]}
              rows={caps.map((c) => [
                c.capability_code,
                <StatusBadge status={c.evidence_status} />,
                c.environment_scope,
                c.notes || '—',
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
