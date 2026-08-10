import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {
  Alert,
  Button,
  ConfirmDialog,
  DataTable,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '../design-system/components';
import {Can} from '../rbac/Can';
import {useToast} from '../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../utils/money';

export function PaymentDetailPage() {
  const {id = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [totp, setTotp] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!token || !id) return;
    v4.payment(token, id)
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, [token, id]);

  if (!data && !error) return <LoadingState />;
  if (error && !data) return <Alert tone="danger">{error}</Alert>;

  const intent = data.intent;
  const canRefund = intent.status === 'SUCCEEDED';

  const submitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const step = totp ? await v4.stepUp(token, totp) : null;
      await v4.createRefund(
        token,
        {
          payment_intent_id: intent.id,
          amount_minor: refundAmount,
          currency_code: intent.currency_code,
          reason: refundReason || undefined,
        },
        step?.step_up_token || step?.token,
      );
      push('Refund created');
      setRefundOpen(false);
      setRefundAmount('');
      setRefundReason('');
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Payment ${shortId(intent.id)}`}
        description="Attempts, transactions, and state transitions. Secrets and PAN are never shown."
        crumbs={[{label: 'Payments', to: '/payments'}, {label: 'Detail'}]}
        actions={
          <>
            <Can anyOf={['payments.refund', 'payments.manage']}>
              {canRefund ? (
                <Button
                  type="button"
                  onClick={() => {
                    setRefundAmount(String(intent.amount_minor));
                    setRefundOpen(true);
                  }}
                >
                  Refund
                </Button>
              ) : null}
            </Can>
            <Can anyOf={['payments.cancel', 'payments.manage']}>
              {['CREATED', 'REQUIRES_PAYMENT', 'PROCESSING'].includes(intent.status) ? (
                <Button variant="danger" type="button" onClick={() => setConfirmCancel(true)}>
                  Cancel payment
                </Button>
              ) : null}
            </Can>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone="info">
        Sandbox refunds post to the ledger with step-up. Live provider refunds are{' '}
        <strong>BLOCKED BY: DEC-009</strong>.
      </Alert>
      <div className="v4-stat-grid">
        <div className="v4-stat">
          <span>Status</span>
          <strong>
            <StatusBadge status={intent.status} />
          </strong>
        </div>
        <div className="v4-stat">
          <span>Amount</span>
          <strong>{formatMoney(intent.amount_minor, intent.currency_code)}</strong>
        </div>
        <div className="v4-stat">
          <span>Created</span>
          <strong style={{fontSize: '1rem'}}>{formatDate(intent.created_at)}</strong>
        </div>
      </div>
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>Attempts</h3>
        <DataTable
          columns={['#', 'Status', 'Provider', 'Reference', 'Failure', 'Started']}
          rows={(data.attempts || []).map((a: any) => [
            a.attempt_number,
            <StatusBadge status={a.status} />,
            a.provider_code || '—',
            shortId(a.provider_reference),
            a.failure_message || a.failure_code || '—',
            formatDate(a.started_at),
          ])}
        />
      </div>
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>Transactions</h3>
        <DataTable
          columns={['Txn', 'Status', 'Provider', 'Provider txn', 'Amount', 'Created']}
          rows={(data.transactions || []).map((t: any) => [
            shortId(t.id),
            <StatusBadge status={t.status} />,
            t.provider_code || '—',
            shortId(t.provider_transaction_id),
            formatMoney(t.amount_minor, t.currency_code),
            formatDate(t.created_at),
          ])}
        />
      </div>
      <div className="v4-card">
        <h3>Timeline</h3>
        <DataTable
          columns={['From', 'To', 'Actor', 'Reason', 'At']}
          rows={(data.history || []).map((h: any) => [
            h.from_status || '—',
            h.to_status,
            h.actor_type,
            h.reason || '—',
            formatDate(h.created_at),
          ])}
        />
      </div>
      <p style={{marginTop: '1rem'}}>
        <Link to="/refunds">View all refunds</Link>
      </p>
      {refundOpen ? (
        <Modal title="Create refund" onClose={() => setRefundOpen(false)}>
          <form onSubmit={submitRefund}>
            <Field label="Original amount">
              <input readOnly value={formatMoney(intent.amount_minor, intent.currency_code)} />
            </Field>
            <Field label="Refund amount (minor units)" hint="Partial refunds allowed; total cannot exceed captured">
              <input
                required
                pattern="\d+"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </Field>
            <Field label="Reason">
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </Field>
            <Field label="MFA / step-up TOTP">
              <input required value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Processing…' : 'Confirm refund'}
            </Button>
          </form>
        </Modal>
      ) : null}
      {confirmCancel ? (
        <ConfirmDialog
          title="Cancel payment?"
          message="This cancels the payment intent if still cancellable."
          danger
          confirmLabel="Cancel payment"
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => {
            void v4
              .cancelPayment(token, id)
              .then(() => {
                push('Payment cancelled');
                setConfirmCancel(false);
                load();
              })
              .catch((e) => setError(e.message));
          }}
        />
      ) : null}
    </div>
  );
}
