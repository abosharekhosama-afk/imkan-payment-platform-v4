import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, LoadingState, PageHeader} from '../../design-system/components';
import {Select} from '../../design-system/Select';
import {useI18n} from '../../i18n/I18nProvider';
import {formatMoney} from '../../utils/money';

export function WalletPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [environment, setEnvironment] = useState<'SANDBOX' | 'LIVE'>('SANDBOX');
  const [statement, setStatement] = useState<any>(null);
  const [balances, setBalances] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const q = `?environment=${environment}`;
    Promise.all([
      v4.financeStatement(token, q),
      v4.balances(token).catch(() => null),
    ])
      .then(([s, b]) => {
        setStatement(s);
        setBalances(b);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, environment]);

  const currency = statement?.currency_code || balances?.currency_code || 'SAR';
  const totals = statement?.totals || {};

  return (
    <div>
      <PageHeader
        title={t('wallet.title')}
        description={t('wallet.description')}
        crumbs={[{label: t('section.finance')}, {label: t('nav.wallet')}]}
        actions={
          <Select
            value={environment}
            onChange={(v) => setEnvironment(v as 'SANDBOX' | 'LIVE')}
            options={[
              {value: 'SANDBOX', label: t('env.sandbox')},
              {value: 'LIVE', label: t('env.live')},
            ]}
          />
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="v4-wallet-hero">
            <div className="v4-wallet-hero-main">
              <span>{t('wallet.netAvailable')}</span>
              <strong>{formatMoney(totals.net_to_merchant_minor || '0', currency)}</strong>
              <p>{t('wallet.netHint')}</p>
            </div>
            <div className="v4-wallet-hero-stats">
              <div>
                <span>{t('wallet.gross')}</span>
                <strong>{formatMoney(totals.gross_minor || '0', currency)}</strong>
              </div>
              <div>
                <span>{t('wallet.platformFees')}</span>
                <strong>{formatMoney(totals.platform_fees_minor || '0', currency)}</strong>
              </div>
              <div>
                <span>{t('wallet.providerFees')}</span>
                <strong>{formatMoney(totals.provider_fees_minor || '0', currency)}</strong>
              </div>
              <div>
                <span>{t('wallet.payments')}</span>
                <strong>{totals.payment_count || 0}</strong>
              </div>
            </div>
          </div>
          {balances ? (
            <div className="v4-stat-grid" style={{marginTop: 16}}>
              {[
                [t('finance.balances.available'), formatMoney(balances.available_minor, balances.currency_code || currency)],
                [t('finance.balances.pending'), formatMoney(balances.pending_minor, balances.currency_code || currency)],
                [t('finance.balances.reserved'), formatMoney(balances.reserved_minor, balances.currency_code || currency)],
                [t('finance.balances.settled'), formatMoney(balances.settled_minor, balances.currency_code || currency)],
              ].map(([label, value]) => (
                <div className="v4-stat" key={String(label)}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <p style={{marginTop: 16}}>
            <Link to="/reports">{t('wallet.openReports')}</Link>
            {' · '}
            <Link to="/payouts">{t('wallet.openPayouts')}</Link>
            {' · '}
            <Link to="/merchant/bank-accounts">{t('wallet.openBank')}</Link>
          </p>
          <div style={{marginTop: 12}}>
            <Button variant="secondary" type="button" onClick={() => v4.downloadFinanceStatementCsv(token, `?environment=${environment}`)}>
              {t('wallet.exportCsv')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
