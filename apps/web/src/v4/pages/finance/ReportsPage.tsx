import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Select} from '../../design-system/Select';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {regionForPayment, regionLabelKey} from '../../utils/region';

type Tab = 'statement' | 'settlements' | 'payouts' | 'providers';

export function ReportsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [tab, setTab] = useState<Tab>('statement');
  const [environment, setEnvironment] = useState<'SANDBOX' | 'LIVE'>('SANDBOX');
  const [statement, setStatement] = useState<any>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      v4.financeStatement(token, `?environment=${environment}`),
      v4.settlements(token).catch(() => []),
      v4.payouts(token).catch(() => []),
    ])
      .then(([s, st, po]) => {
        setStatement(s);
        setSettlements(st);
        setPayouts(po);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, environment]);

  const currency = statement?.currency_code || 'SAR';
  const totals = statement?.totals || {};

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.description')}
        crumbs={[{label: t('section.finance')}, {label: t('nav.reports')}]}
        actions={
          <>
            <Select
              value={environment}
              onChange={(v) => setEnvironment(v as 'SANDBOX' | 'LIVE')}
              options={[
                {value: 'SANDBOX', label: t('env.sandbox')},
                {value: 'LIVE', label: t('env.live')},
              ]}
            />
            <Button
              variant="secondary"
              type="button"
              onClick={() => v4.downloadFinanceStatementCsv(token, `?environment=${environment}`)}
            >
              {t('reports.exportCsv')}
            </Button>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar">
        {(['statement', 'settlements', 'payouts', 'providers'] as Tab[]).map((id) => (
          <Button key={id} variant={tab === id ? 'primary' : 'secondary'} type="button" onClick={() => setTab(id)}>
            {t(`reports.tab.${id}`)}
          </Button>
        ))}
      </div>
      {loading ? (
        <LoadingState />
      ) : tab === 'statement' ? (
        <>
          <div className="v4-stat-grid">
            {[
              [t('wallet.gross'), formatMoney(totals.gross_minor || '0', currency)],
              [t('wallet.platformFees'), formatMoney(totals.platform_fees_minor || '0', currency)],
              [t('wallet.providerFees'), formatMoney(totals.provider_fees_minor || '0', currency)],
              [t('wallet.netAvailable'), formatMoney(totals.net_to_merchant_minor || '0', currency)],
            ].map(([label, value]) => (
              <div className="v4-stat" key={String(label)}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <DataTable
            columns={[
              t('payments.colPayment'),
              t('common.date'),
              t('common.amount'),
              t('wallet.platformFees'),
              t('wallet.providerFees'),
              t('wallet.netAvailable'),
              '',
            ]}
            rows={(statement?.lines || []).map((r: any) => [
              shortId(r.id),
              formatDate(r.created_at),
              formatMoney(r.gross_minor, r.currency_code),
              formatMoney(r.platform_fees_minor, r.currency_code),
              formatMoney(r.provider_fees_minor, r.currency_code),
              formatMoney(r.net_to_merchant_minor, r.currency_code),
              <Link to={`/payments/${r.id}`}>{t('common.details')}</Link>,
            ])}
          />
        </>
      ) : tab === 'settlements' ? (
        <DataTable
          columns={[
            t('finance.settlements.colSettlement'),
            t('common.currency'),
            t('finance.settlements.colGross'),
            t('finance.settlements.colNet'),
            t('common.status'),
            t('common.created'),
          ]}
          rows={settlements.map((r) => [
            shortId(r.id),
            r.currency_code,
            formatMoney(r.gross_minor, r.currency_code),
            formatMoney(r.net_minor, r.currency_code),
            <StatusBadge status={r.status} />,
            formatDate(r.created_at),
          ])}
        />
      ) : tab === 'payouts' ? (
        <DataTable
          columns={[
            t('finance.payouts.colPayout'),
            t('common.amount'),
            t('common.status'),
            t('finance.payouts.colRail'),
            t('finance.payouts.colEvidence'),
            t('common.created'),
          ]}
          rows={payouts.map((r) => [
            shortId(r.id),
            formatMoney(r.amount_minor, r.currency_code),
            <StatusBadge status={r.status} />,
            r.rail_code || '—',
            r.external_evidence_ref || '—',
            formatDate(r.created_at),
          ])}
        />
      ) : (
        <DataTable
          columns={[
            t('providers.accounts.colProvider'),
            t('wallet.payments'),
            t('wallet.gross'),
            t('wallet.netAvailable'),
            t('region.label'),
          ]}
          rows={(statement?.provider_mix || []).map((r: any) => [
            r.provider_code,
            r.payment_count,
            formatMoney(r.gross_minor, currency),
            formatMoney(r.net_to_merchant_minor, currency),
            t(regionLabelKey(regionForPayment(currency, r.provider_code))),
          ])}
        />
      )}
    </div>
  );
}
