import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, Modal, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {obtainStepUp} from '../../rbac/stepUp';
import {useToast} from '../../hooks/useToast';
import {formatDate, formatMoney, shortId} from '../../utils/money';

export function InvoiceDetailPage() {
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
        title={`Invoice ${invoice.number || shortId(invoice.id)}`}
        crumbs={[{label: 'Billing'}, {label: 'Invoices', to: '/invoices'}, {label: 'Detail'}]}
        actions={
          <Can anyOf={['invoices.pay', 'invoices.manage', 'billing.manage']}>
            {['OPEN', 'OVERDUE'].includes(invoice.status) ? (
              <Button type="button" onClick={() => setCollectOpen(true)}>
                Collect now
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
        <p>Total: {formatMoney(invoice.total_minor, invoice.currency_code)}</p>
        <p>Subscription: {shortId(invoice.subscription_id)}</p>
        <p>
          Period: {formatDate(invoice.period_start)} → {formatDate(invoice.period_end)}
        </p>
      </div>
      {collectOpen ? (
        <Modal title="Collect invoice (step-up required)" onClose={() => setCollectOpen(false)}>
          <form onSubmit={collect}>
            {mfaSecretOnce ? (
              <Alert tone="info">
                MFA secret (copy now): <code>{mfaSecretOnce}</code>
              </Alert>
            ) : null}
            <Field label="TOTP code">
              <input value={totp} onChange={(e) => setTotp(e.target.value)} required inputMode="numeric" />
            </Field>
            <Button type="submit">Confirm collect</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
