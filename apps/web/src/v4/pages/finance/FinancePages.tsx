import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {CurrencySelect} from '../../design-system/CurrencySelect';

export function RefundsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    payment_intent_id: '',
    amount_minor: '',
    currency_code: 'SAR',
    reason: '',
    totp: '',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.refunds(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const step = form.totp ? await v4.stepUp(token, form.totp) : null;
      await v4.createRefund(
        token,
        {
          payment_intent_id: form.payment_intent_id,
          amount_minor: form.amount_minor,
          currency_code: form.currency_code,
          reason: form.reason || undefined,
        },
        step?.step_up_token || step?.token,
      );
      setForm({...form, payment_intent_id: '', amount_minor: '', reason: '', totp: ''});
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('finance.refunds.title')}
        description={t('finance.refunds.description')}
        crumbs={[{label: t('section.finance')}, {label: t('nav.refunds')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Can anyOf={['payments.refund', 'payments.manage']}>
        <div className="v4-card" style={{marginBottom: '1rem'}}>
          <form onSubmit={create}>
            <Field label={t('finance.refunds.labelPaymentId')}>
              <input
                required
                value={form.payment_intent_id}
                onChange={(e) => setForm({...form, payment_intent_id: e.target.value})}
              />
            </Field>
            <Field label={t('finance.refunds.labelAmount')}>
              <input
                required
                pattern="\d+"
                value={form.amount_minor}
                onChange={(e) => setForm({...form, amount_minor: e.target.value})}
              />
            </Field>
            <Field label={t('common.currency')}>
              <CurrencySelect
                value={form.currency_code}
                onChange={(currency_code) => setForm({...form, currency_code})}
                required
              />
            </Field>
            <Field label={t('finance.refunds.labelReason')}>
              <input value={form.reason} onChange={(e) => setForm({...form, reason: e.target.value})} />
            </Field>
            <Field label={t('finance.refunds.labelTotp')}>
              <input value={form.totp} onChange={(e) => setForm({...form, totp: e.target.value})} />
            </Field>
            <Button type="submit">{t('finance.refunds.create')}</Button>
          </form>
        </div>
      </Can>
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('finance.refunds.colRefund')}</th>
                <th>{t('finance.refunds.colPayment')}</th>
                <th>{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{shortId(r.id)}</td>
                    <td>{shortId(r.payment_intent_id)}</td>
                    <td>{formatMoney(r.amount_minor, r.currency_code)}</td>
                    <td>{r.status}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{t('finance.refunds.empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BalancesPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    v4.balances(token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  return (
    <div>
      <PageHeader
        title={t('finance.balances.title')}
        description={t('finance.balances.description')}
        crumbs={[{label: t('section.finance')}, {label: t('nav.balances')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data && !error ? <LoadingState /> : null}
      {data ? (
        <div className="v4-stat-grid">
          {[
            [t('finance.balances.available'), formatMoney(data.available_minor, data.currency_code)],
            [t('finance.balances.pending'), formatMoney(data.pending_minor, data.currency_code)],
            [t('finance.balances.reserved'), formatMoney(data.reserved_minor, data.currency_code)],
            [t('finance.balances.settled'), formatMoney(data.settled_minor, data.currency_code)],
          ].map(([label, value]) => (
            <div className="v4-stat" key={String(label)}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {data?.phase ? (
        <Alert tone="info">
          {t('finance.balances.source', {source: data.source || 'financial_core', phase: data.phase})}
        </Alert>
      ) : null}
      {data?.note ? <Alert tone="info">{data.note}</Alert> : null}
    </div>
  );
}

export function SettlementsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    v4.settlements(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <PageHeader title={t('finance.settlements.title')} description={t('finance.settlements.description')} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('finance.settlements.colSettlement')}</th>
                <th>{t('common.currency')}</th>
                <th>{t('finance.settlements.colGross')}</th>
                <th>{t('finance.settlements.colNet')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{shortId(r.id)}</td>
                    <td>{r.currency_code}</td>
                    <td>{formatMoney(r.gross_minor, r.currency_code)}</td>
                    <td>{formatMoney(r.net_minor, r.currency_code)}</td>
                    <td>{r.status}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>{t('common.noRecords')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PayoutsPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    v4.payouts(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <PageHeader title={t('finance.payouts.title')} description={t('finance.payouts.description')} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('finance.payouts.colPayout')}</th>
                <th>{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('finance.payouts.colSettlement')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{shortId(r.id)}</td>
                    <td>{formatMoney(r.amount_minor, r.currency_code)}</td>
                    <td>{r.status}</td>
                    <td>{r.settlement_id ? shortId(r.settlement_id) : '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{t('common.noRecords')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DisputesPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    v4.disputes(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <PageHeader title={t('finance.disputes.title')} description={t('finance.disputes.description')} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('finance.disputes.colDispute')}</th>
                <th>{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('finance.disputes.colReason')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{shortId(r.id)}</td>
                    <td>{formatMoney(r.amount_minor, r.currency_code)}</td>
                    <td>{r.status}</td>
                    <td>{r.reason || '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{t('common.noRecords')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RiskPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) return;
    v4.riskSignals(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);
  return (
    <div>
      <PageHeader title={t('finance.risk.title')} description={t('finance.risk.description')} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>{t('finance.risk.colSignal')}</th>
                <th>{t('finance.risk.colType')}</th>
                <th>{t('finance.risk.colDecision')}</th>
                <th>{t('finance.risk.colScore')}</th>
                <th>{t('common.created')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{shortId(r.id)}</td>
                    <td>{r.signal_type}</td>
                    <td>{r.decision}</td>
                    <td>{r.score ?? '—'}</td>
                    <td>{formatDate(r.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>{t('common.noRecords')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
