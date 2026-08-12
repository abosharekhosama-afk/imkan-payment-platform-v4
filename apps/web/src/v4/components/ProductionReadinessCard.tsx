import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, LoadingState, StatusBadge} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';

type ReadinessItem = {
  id: string;
  status: 'complete' | 'pending' | 'optional' | 'blocked';
  detail?: string;
  href?: string;
};

export function ProductionReadinessCard() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !hasPermission('payments.read', 'org.read')) return;
    v4.paymentsReadiness(token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token, hasPermission]);

  if (!hasPermission('payments.read', 'org.read')) return null;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <LoadingState />;

  const items = (data.items || []) as ReadinessItem[];
  const summary = data.summary || {};

  const labelFor = (item: ReadinessItem) => {
    const key = `readiness.item.${item.id}`;
    return t(key as any);
  };

  const toneFor = (status: ReadinessItem['status']) => {
    if (status === 'complete') return 'success';
    if (status === 'blocked') return 'danger';
    if (status === 'optional') return 'info';
    return 'warning';
  };

  return (
    <div className="v4-card" style={{marginBottom: '1rem'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12}}>
        <div>
          <h3 style={{marginTop: 0}}>{t('readiness.title')}</h3>
          <p style={{color: 'var(--v4-text-muted)', margin: '0 0 0.75rem'}}>{t('readiness.description')}</p>
        </div>
        <StatusBadge
          status={summary.ready_for_sandbox_checkout ? 'READY' : summary.payments_allowed ? 'PARTIAL' : 'BLOCKED'}
        />
      </div>
      {summary.uses_stripe ? <Alert tone="info">{t('readiness.stripeMoneyPath')}</Alert> : null}
      <ul style={{listStyle: 'none', padding: 0, margin: '12px 0 0'}}>
        {items.map((item) => (
          <li
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid var(--v4-border)',
            }}
          >
            <div>
              <strong>{labelFor(item)}</strong>
              {item.detail ? (
                <div style={{fontSize: 13, color: 'var(--v4-text-muted)'}}>{item.detail}</div>
              ) : null}
            </div>
            <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
              <StatusBadge status={item.status.toUpperCase()} />
              {item.href ? (
                <Link to={item.href} style={{fontSize: 13}}>
                  {t('readiness.open')}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {summary.ready_for_sandbox_checkout ? (
        <Alert tone="success">{t('readiness.sandboxReady')}</Alert>
      ) : (
        <Alert tone="warning">{t('readiness.sandboxPending')}</Alert>
      )}
    </div>
  );
}
