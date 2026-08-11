import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, Modal, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function InvoiceDetailPage() {
  const {t} = useI18n();
  const {id = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState('');
  const [collectOpen, setCollectOpen] = useState(false);
  const [totp, setTotp] = useState('');
  const [mfaSecretOnce, setMfaSecretOnce] = useState<string | null>(null);

  const load = () => {
    if (!token || !id) return;
    v4.invoice(token, id)
      .then(setRow)
      .catch((e) => setError(e.message));
  };
  useEffect(load, [token, id]);

  const collect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await obtainStepUp(token, totp);
      if (result.enrolled) {
        setMfaSecretOnce(result.mfaSecret || null);
        setError('MFA enrolled — enter a TOTP from your authenticator and submit again.');
        setTotp('');
        return;
      }
      await v4.collectInvoice(token, id, result.stepUpToken);
      push('Collected');
      setCollectOpen(false);
      setTotp('');
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!row && !error) return <LoadingState />;
  if (error && !row) return <Alert tone="danger">{error}</Alert>;

  const invoice = row.invoice || row;

  return (
    <div>
      <PageHeader
        title={t('invoiceDetail.title', {number: invoice.number || shortId(invoice.id)})}
        crumbs={[
          {label: t('section.billing')},
          {label: t('nav.invoices'), to: '/invoices'},
          {label: t('common.detail')},
        ]}
        actions={
          <Can anyOf={['invoices.pay', 'invoices.manage', 'billing.manage']}>
            {['OPEN', 'OVERDUE'].includes(invoice.status) ? (
              <Button type="button" onClick={() => setCollectOpen(true)}>
                {t('invoiceDetail.collectNow')}
              </Button>
            ) : null}
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card">
        <p>
          <StatusBadge status={invoice.status} />
        </p>
        <p>
          {t('invoiceDetail.labelTotal')} {formatMoney(invoice.total_minor, invoice.currency_code)}
        </p>
        <p>
          {t('invoiceDetail.labelSubscription')} {shortId(invoice.subscription_id)}
        </p>
        <p>
          {t('invoiceDetail.labelPeriod')} {formatDate(invoice.period_start)} → {formatDate(invoice.period_end)}
        </p>
      </div>
      {collectOpen ? (
        <Modal title={t('invoiceDetail.modalCollect')} onClose={() => setCollectOpen(false)}>
          <form onSubmit={collect}>
            {mfaSecretOnce ? (
              <Alert tone="info">
                {t('subscriptions.mfaSecret')} <code>{mfaSecretOnce}</code>
              </Alert>
            ) : null}
            <Field label={t('subscriptions.labelTotp')}>
              <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
            </Field>
            <Button type="submit">{t('invoiceDetail.confirmCollect')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
