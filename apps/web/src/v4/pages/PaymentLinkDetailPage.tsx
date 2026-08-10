import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {checkoutWebUrl} from '../api/client';
import {v4} from '../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {Can} from '../rbac/Can';
import {useToast} from '../hooks/useToast';
import {formatDate, formatMoney} from '../utils/money';

export function PaymentLinkDetailPage() {
  const {id = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!token || !id) return;
    v4.paymentLink(token, id)
      .then(setRow)
      .catch((e) => setError(e.message));
  };

  useEffect(load, [token, id]);

  const act = async (action: string) => {
    try {
      await v4.paymentLinkAction(token, id, action);
      push(`Link ${action}`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!row && !error) return <LoadingState />;
  if (error && !row) return <Alert tone="danger">{error}</Alert>;

  const webUrl = checkoutWebUrl(row.public_token);

  return (
    <div>
      <PageHeader
        title={row.title}
        description="Payment link detail"
        crumbs={[{label: 'Payments', to: '/payments'}, {label: 'Payment Links', to: '/payment-links'}, {label: 'Detail'}]}
        actions={
          <Can anyOf={['payment_links.manage']}>
            <>
              {row.status === 'DRAFT' || row.status === 'INACTIVE' ? (
                <Button type="button" onClick={() => void act('activate')}>
                  Activate
                </Button>
              ) : null}
              {row.status === 'ACTIVE' ? (
                <Button variant="secondary" type="button" onClick={() => void act('deactivate')}>
                  Deactivate
                </Button>
              ) : null}
              {['DRAFT', 'ACTIVE', 'INACTIVE'].includes(row.status) ? (
                <Button variant="danger" type="button" onClick={() => void act('cancel')}>
                  Cancel
                </Button>
              ) : null}
            </>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card">
        <p>
          <StatusBadge status={row.status} /> · {formatMoney(row.amount_minor, row.currency_code)}
        </p>
        <p>
          <strong>Checkout URL</strong>
          <br />
          <a href={webUrl} target="_blank" rel="noreferrer">
            {webUrl}
          </a>
        </p>
        <div className="v4-toolbar">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(webUrl);
              push('Copied');
            }}
          >
            Copy URL
          </Button>
          <Link to={`/checkout/${row.public_token}`} target="_blank">
            <Button type="button">Open checkout</Button>
          </Link>
        </div>
        <p style={{color: 'var(--v4-text-muted)'}}>
          Created {formatDate(row.created_at)} · Uses {row.use_count ?? 0}
          {row.max_uses != null ? ` / ${row.max_uses}` : ''}
        </p>
      </div>
    </div>
  );
}
