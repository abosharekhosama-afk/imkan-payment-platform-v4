import React, {useMemo} from 'react';
import {Link} from 'react-router-dom';
import {StatusBadge} from '../design-system/components';
import {formatDate, formatMoney, shortId} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';

type Summary = {
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  pending_count: number;
  cancelled_count: number;
  succeeded_volume_minor: string;
  platform_fees_minor?: string;
  provider_fees_minor?: string;
  net_to_merchant_minor?: string;
  currency_breakdown?: {currency_code: string; count: number}[];
  recent_payments?: any[];
  daily_series?: {day: string; count: number; succeeded_count: number; volume_minor: string}[];
  success_rate?: number;
  avg_succeeded_minor?: string;
  primary_currency?: string;
};

export function DashboardAnalytics({data}: {data: Summary}) {
  const {t} = useI18n();
  const primaryCurrency = data.primary_currency || data.currency_breakdown?.[0]?.currency_code || 'SAR';
  const successRate = data.success_rate ?? (data.total_count ? data.succeeded_count / data.total_count : 0);
  const series = data.daily_series || [];
  const maxVol = useMemo(
    () => Math.max(1, ...series.map((d) => Number(d.volume_minor || 0))),
    [series],
  );

  return (
    <>
      <div className="v4-analytics-hero">
        <div className="v4-analytics-hero-main">
          <span>{t('dashboard.succeededVolume')}</span>
          <strong>{formatMoney(data.succeeded_volume_minor, primaryCurrency)}</strong>
          <p>
            {t('dashboard.successRate')}: {(successRate * 100).toFixed(1)}% · {data.succeeded_count}{' '}
            {t('dashboard.of')} {data.total_count}
          </p>
          {data.net_to_merchant_minor != null ? (
            <p>
              {t('dashboard.netVolume')}: {formatMoney(data.net_to_merchant_minor, primaryCurrency)}
            </p>
          ) : null}
        </div>
        <div className="v4-analytics-hero-stats">
          <div>
            <span>{t('dashboard.avgPayment')}</span>
            <strong>{formatMoney(data.avg_succeeded_minor || '0', primaryCurrency)}</strong>
          </div>
          <div>
            <span>{t('dashboard.pending')}</span>
            <strong>{data.pending_count}</strong>
          </div>
        </div>
      </div>

      <div className="v4-stat-grid">
        {[
          [t('dashboard.totalPayments'), data.total_count],
          [t('dashboard.succeeded'), data.succeeded_count],
          [t('dashboard.failed'), data.failed_count],
          [t('dashboard.pending'), data.pending_count],
          [t('dashboard.cancelled'), data.cancelled_count],
        ].map(([label, value]) => (
          <div className="v4-stat" key={String(label)}>
            <span>{label}</span>
            <strong>{value as number}</strong>
          </div>
        ))}
      </div>

      {series.length ? (
        <div className="v4-card v4-analytics-chart">
          <h3 style={{marginTop: 0}}>{t('dashboard.volumeChart')}</h3>
          <p style={{color: 'var(--v4-text-muted)', marginTop: 0, fontSize: '0.9rem'}}>
            {t('dashboard.volumeChartHint')}
          </p>
          <div className="v4-bar-chart" role="img" aria-label={t('dashboard.volumeChart')}>
            {series.map((d) => {
              const h = Math.max(4, Math.round((Number(d.volume_minor) / maxVol) * 100));
              return (
                <div className="v4-bar-chart-col" key={d.day} title={`${d.day}: ${formatMoney(d.volume_minor, primaryCurrency)}`}>
                  <div className="v4-bar-chart-bar" style={{height: `${h}%`}} />
                  <span className="v4-bar-chart-label">{d.day.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {data.currency_breakdown?.length ? (
        <div className="v4-card" style={{marginBottom: '1rem'}}>
          <h3 style={{marginTop: 0}}>{t('dashboard.currencyMix')}</h3>
          <div className="v4-currency-mix">
            {data.currency_breakdown.map((c) => (
              <div className="v4-currency-pill" key={c.currency_code}>
                <strong>{c.currency_code}</strong>
                <span>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
  );
}
