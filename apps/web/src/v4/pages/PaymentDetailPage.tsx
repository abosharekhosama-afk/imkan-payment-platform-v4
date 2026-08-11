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
import {useI18n} from '../i18n/I18nProvider';

export function PaymentDetailPage() {
  const {t} = useI18n();
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
        title={t('paymentDetail.title', {id: shortId(intent.id)})}
        description={t('paymentDetail.description')}
        crumbs={[{label: t('section.payments'), to: '/payments'}, {label: t('common.detail')}]}
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
                  {t('paymentDetail.refund')}
                </Button>
              ) : null}
            </Can>
            <Can anyOf={['payments.cancel', 'payments.manage']}>
              {['CREATED', 'REQUIRES_PAYMENT', 'PROCESSING'].includes(intent.status) ? (
                <Button variant="danger" type="button" onClick={() => setConfirmCancel(true)}>
                  {t('paymentDetail.cancelPayment')}
                </Button>
              ) : null}
            </Can>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone="info">{t('paymentDetail.sandboxRefundAlert')}</Alert>
      <div className="v4-stat-grid">
        <div className="v4-stat">
          <span>{t('common.status')}</span>
          <strong>
            <StatusBadge status={intent.status} />
          </strong>
        </div>
        <div className="v4-stat">
          <span>{t('common.amount')}</span>
          <strong>{formatMoney(intent.amount_minor, intent.currency_code)}</strong>
        </div>
        <div className="v4-stat">
          <span>{t('common.created')}</span>
          <strong style={{fontSize: '1rem'}}>{formatDate(intent.created_at)}</strong>
        </div>
      </div>
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>{t('paymentDetail.attempts')}</h3>
        <DataTable
          columns={[
            t('paymentDetail.colAttempt'),
            t('common.status'),
            t('transactions.colProvider'),
            t('paymentDetail.colReference'),
            t('paymentDetail.colFailure'),
            t('paymentDetail.colStarted'),
          ]}
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
        <h3>{t('paymentDetail.transactions')}</h3>
        <DataTable
          columns={[
            t('transactions.colTxn'),
            t('common.status'),
            t('transactions.colProvider'),
            t('paymentDetail.colProviderTxn'),
            t('common.amount'),
            t('common.created'),
          ]}
          rows={(data.transactions || []).map((txn: any) => [
            shortId(txn.id),
            <StatusBadge status={txn.status} />,
            txn.provider_code || '—',
            shortId(txn.provider_transaction_id),
            formatMoney(txn.amount_minor, txn.currency_code),
            formatDate(txn.created_at),
          ])}
        />
      </div>
      <div className="v4-card">
        <h3>{t('paymentDetail.timeline')}</h3>
        <DataTable
          columns={[
            t('paymentDetail.colFrom'),
            t('paymentDetail.colTo'),
            t('paymentDetail.colActor'),
            t('paymentDetail.colReason'),
            t('paymentDetail.colAt'),
          ]}
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
        <Link to="/refunds">{t('paymentDetail.viewRefunds')}</Link>
      </p>
      {refundOpen ? (
        <Modal title={t('paymentDetail.createRefund')} onClose={() => setRefundOpen(false)}>
          <form onSubmit={submitRefund}>
            <Field label={t('paymentDetail.originalAmount')}>
              <input readOnly value={formatMoney(intent.amount_minor, intent.currency_code)} />
            </Field>
            <Field label={t('paymentDetail.refundAmount')} hint={t('paymentDetail.refundAmountHint')}>
              <input
                required
                pattern="\d+"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </Field>
            <Field label={t('paymentDetail.reason')}>
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </Field>
            <Field label={t('finance.refunds.labelTotp')}>
              <input required value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? t('common.processing') : t('paymentDetail.confirmRefund')}
            </Button>
          </form>
        </Modal>
      ) : null}
      {confirmCancel ? (
        <ConfirmDialog
          title={t('paymentDetail.cancelTitle')}
          message={t('paymentDetail.cancelMessage')}
          danger
          confirmLabel={t('paymentDetail.cancelPayment')}
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
