import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {formatDate, formatMoney, shortId} from '../../utils/money';

export function RefundsPage() {
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
        title="Refunds"
        description="Sandbox refunds post to ledger. Live provider refunds BLOCKED BY: DEC-009."
        crumbs={[{label: 'Finance'}, {label: 'Refunds'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Can anyOf={['payments.refund', 'payments.manage']}>
        <div className="v4-card" style={{marginBottom: '1rem'}}>
          <form onSubmit={create}>
            <Field label="Payment intent ID">
              <input
                required
                value={form.payment_intent_id}
                onChange={(e) => setForm({...form, payment_intent_id: e.target.value})}
              />
            </Field>
            <Field label="Amount (minor units)">
              <input
                required
                pattern="\d+"
                value={form.amount_minor}
                onChange={(e) => setForm({...form, amount_minor: e.target.value})}
              />
            </Field>
            <Field label="Currency">
              <input
                required
                maxLength={3}
                value={form.currency_code}
                onChange={(e) => setForm({...form, currency_code: e.target.value.toUpperCase()})}
              />
            </Field>
            <Field label="Reason">
              <input value={form.reason} onChange={(e) => setForm({...form, reason: e.target.value})} />
            </Field>
            <Field label="MFA / step-up TOTP (if required)">
              <input value={form.totp} onChange={(e) => setForm({...form, totp: e.target.value})} />
            </Field>
            <Button type="submit">Create refund</Button>
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
                <th>Refund</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
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
                  <td colSpan={5}>No refunds</td>
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
        title="Balances"
        description="Derived from double-entry ledger. Never summed in the browser."
        crumbs={[{label: 'Finance'}, {label: 'Balances'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!data && !error ? <LoadingState /> : null}
      {data ? (
        <div className="v4-stat-grid">
          {[
            ['Available', formatMoney(data.available_minor, data.currency_code)],
            ['Pending', formatMoney(data.pending_minor, data.currency_code)],
            ['Reserved', formatMoney(data.reserved_minor, data.currency_code)],
            ['Settled', formatMoney(data.settled_minor, data.currency_code)],
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
          Source: {data.source || 'financial_core'} ({data.phase}). Values are never summed in the browser.
        </Alert>
      ) : null}
      {data?.note ? <Alert tone="info">{data.note}</Alert> : null}
    </div>
  );
}

export function SettlementsPage() {
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
      <PageHeader title="Settlements" description="Draft settlements from succeeded payments. Fees BLOCKED BY: DEC-008." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>Settlement</th>
                <th>Currency</th>
                <th>Gross</th>
                <th>Net</th>
                <th>Status</th>
                <th>Created</th>
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
                  <td colSpan={6}>No records</td>
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
      <PageHeader title="Payouts" description="Payout creation requires step-up. Live rails BLOCKED BY: DEC-009." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>Payout</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Settlement</th>
                <th>Created</th>
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
                  <td colSpan={5}>No records</td>
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
      <PageHeader title="Disputes" description="Dispute records foundation." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>Dispute</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Reason</th>
                <th>Created</th>
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
                  <td colSpan={5}>No records</td>
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
      <PageHeader title="Risk signals" description="Manual / recorded risk signals (foundation)." />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <div className="v4-table-wrap">
          <table className="v4-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Type</th>
                <th>Decision</th>
                <th>Score</th>
                <th>Created</th>
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
                  <td colSpan={5}>No records</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
