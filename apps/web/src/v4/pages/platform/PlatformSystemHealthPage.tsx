import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';

function CheckRow({label, ok, detail}: {label: string; ok: boolean; detail?: string}) {
  return (
    <div style={{display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--v4-border)'}}>
      <span>{label}</span>
      <span style={{textAlign: 'end'}}>
        <StatusBadge status={ok ? 'ACTIVE' : 'FAILED'} />{' '}
        {detail ? <span style={{color: 'var(--v4-text-muted)', fontSize: 13}}>{detail}</span> : null}
      </span>
    </div>
  );
}

export function PlatformSystemHealthPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4
      .platformSystemHealth(token)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const checks = data?.checks || {};
  const counts = data?.counts || {};
  const runtime = data?.runtime;

  return (
    <div>
      <PageHeader
        title={t('platform.health.title')}
        description={t('platform.health.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.platformHealth')}]}
        actions={
          <Button type="button" variant="secondary" onClick={load}>
            {t('common.refresh')}
          </Button>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : !data ? (
        <Alert tone="warning">{t('platform.health.loadFailed')}</Alert>
      ) : (
        <>
          <div className="v4-card" style={{marginBottom: 16}}>
            <h3 style={{marginTop: 0}}>{t('platform.health.overall')}</h3>
            <p>
              {t('platform.health.statusLabel')}{' '}
              <StatusBadge status={data?.status === 'ready' ? 'ACTIVE' : 'NEEDS_INFORMATION'} />
            </p>
            {runtime?.labels?.console_rail ? (
              <p style={{color: 'var(--v4-text-muted)'}}>{runtime.labels.console_rail}</p>
            ) : null}
          </div>

          <div className="v4-card" style={{marginBottom: 16}}>
            <h3 style={{marginTop: 0}}>{t('platform.health.infrastructure')}</h3>
            <CheckRow label="PostgreSQL" ok={checks.postgres === true} />
            <CheckRow label="Redis" ok={checks.redis === 'ok' || checks.redis === 'disabled'} detail={String(checks.redis || '—')} />
            <CheckRow
              label={t('platform.health.rateLimit')}
              ok={!checks.rate_limit?.required || checks.rate_limit?.ready === true}
              detail={checks.rate_limit?.store || '—'}
            />
            <CheckRow
              label={t('platform.health.outboxWorker')}
              ok={checks.outbox_worker_enabled === true}
              detail={checks.outbox_worker_enabled ? 'enabled' : 'disabled'}
            />
            <CheckRow
              label={t('platform.health.email')}
              ok={checks.email_transport === 'smtp' || checks.email_transport === 'stub'}
              detail={checks.email_transport}
            />
            <CheckRow label={t('platform.health.session')} ok detail={checks.session_transport} />
            <CheckRow label={t('platform.health.paymentProvider')} ok detail={checks.payment_provider || '—'} />
            <CheckRow label={t('platform.health.secrets')} ok detail={checks.secret_backend} />
          </div>

          <div className="v4-card" style={{marginBottom: 16}}>
            <h3 style={{marginTop: 0}}>{t('platform.health.counts')}</h3>
            <p>
              {t('platform.health.kybPending')}: <strong>{counts.kyb_pending_review ?? 0}</strong>
            </p>
            <p style={{marginBottom: 4}}>{t('platform.health.orgsByStatus')}</p>
            <ul style={{marginTop: 0}}>
              {(counts.organizations_by_status || []).map((row: any) => (
                <li key={row.status}>
                  {row.status}: {row.count}
                </li>
              ))}
            </ul>
            <p style={{marginBottom: 4}}>{t('platform.health.outbox')}</p>
            <ul style={{marginTop: 0}}>
              {(counts.outbox_by_status || []).map((row: any) => (
                <li key={row.status}>
                  {row.status}: {row.count}
                </li>
              ))}
            </ul>
            <p style={{marginBottom: 4}}>{t('platform.health.webhooks')}</p>
            <ul style={{marginTop: 0}}>
              {(counts.webhook_deliveries_by_status || []).map((row: any) => (
                <li key={row.status}>
                  {row.status}: {row.count}
                </li>
              ))}
            </ul>
          </div>

          {runtime ? (
            <div className="v4-card">
              <h3 style={{marginTop: 0}}>{t('platform.health.runtime')}</h3>
              <pre style={{overflow: 'auto', fontSize: 12, margin: 0}}>{JSON.stringify(runtime, null, 2)}</pre>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
