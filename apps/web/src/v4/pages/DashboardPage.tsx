import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';
import {ProductionReadinessCard} from '../components/ProductionReadinessCard';

export function DashboardPage() {
  const {t} = useI18n();
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
        <PageHeader title={t('dashboard.title')} description={t('dashboard.welcome')} />
        <Alert>{t('dashboard.noPermission')}</Alert>
      </div>
    );
  }

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (hasPermission('payments.read') && !data) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        crumbs={[{label: t('section.overview')}, {label: t('nav.dashboard')}]}
      />
      <Alert tone="warning">{t('dashboard.envWarning')}</Alert>

      <ProductionReadinessCard />

      {kyb ? (
        <div className="v4-card" style={{marginBottom: '1rem'}}>
          <h3 style={{marginTop: 0}}>{t('dashboard.onboardingKyb')}</h3>
          <p style={{margin: '0 0 0.5rem'}}>
            {t('dashboard.statusLabel')} <StatusBadge status={kyb.onboarding_status || kyb.status} /> ·{' '}
            {t('dashboard.missingCount')} {(kyb.missing || []).length}
          </p>
          <Link to="/onboarding">{t('dashboard.openOnboarding')}</Link>
          {' · '}
          <Link to="/merchant/kyb">{t('dashboard.kybDetails')}</Link>
        </div>
      ) : null}

      <div className="v4-card" style={{marginBottom: '1rem'}}>
        <h3 style={{marginTop: 0}}>{t('dashboard.balances')}</h3>
        <p style={{color: 'var(--v4-text-muted)', margin: 0}}>{t('dashboard.balancesHint')}</p>
        <p style={{marginTop: '0.75rem'}}>
          <Link to="/balances">{t('dashboard.openBalances')}</Link>
        </p>
      </div>

      {data ? (
        <>
          <div className="v4-stat-grid">
            {[
              [t('dashboard.totalPayments'), data.total_count],
              [t('dashboard.succeeded'), data.succeeded_count],
              [t('dashboard.failed'), data.failed_count],
              [t('dashboard.pending'), data.pending_count],
              [t('dashboard.cancelled'), data.cancelled_count],
              [
                t('dashboard.succeededVolume'),
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
            <h3 style={{marginTop: 0}}>{t('dashboard.recentPayments')}</h3>
            <div className="v4-table-wrap">
              <table className="v4-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.colPayment')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('dashboard.colAmount')}</th>
                    <th>{t('common.created')}</th>
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
