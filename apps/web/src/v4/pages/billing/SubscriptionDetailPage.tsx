import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';

export function SubscriptionDetailPage() {
  const {id = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const [row, setRow] = useState<any>(null);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    v4.subscriptions(token)
      .then((rows) => {
        const found = rows.find((r) => r.id === id);
        if (!found) throw new Error('Subscription not found');
        setRow(found);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(load, [token, id]);

  const act = async (action: 'pause' | 'resume' | 'cancel') => {
    try {
      await v4.subscriptionAction(token, id, action);
      push(`Subscription ${action}`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!row && !error) return <LoadingState />;
  if (error && !row) return <Alert tone="danger">{error}</Alert>;

  return (
    <div>
      <PageHeader
        title={`Subscription ${shortId(row.id)}`}
        crumbs={[{label: 'Billing'}, {label: 'Subscriptions', to: '/subscriptions'}, {label: 'Detail'}]}
        actions={
          <>
            <Can anyOf={['subscriptions.pause', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="secondary" type="button" onClick={() => void act('pause')}>
                Pause
              </Button>
            </Can>
            <Can anyOf={['subscriptions.resume', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="secondary" type="button" onClick={() => void act('resume')}>
                Resume
              </Button>
            </Can>
            <Can anyOf={['subscriptions.cancel', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="danger" type="button" onClick={() => void act('cancel')}>
                Cancel
              </Button>
            </Can>
          </>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card">
        <p>
          <StatusBadge status={row.status} />
        </p>
        <p>Customer: {shortId(row.customer_id)}</p>
        <p>Price: {shortId(row.price_id)}</p>
        <p>Next billing: {formatDate(row.next_billing_at)}</p>
        <p>Current period end: {formatDate(row.current_period_end)}</p>
      </div>
    </div>
  );
}
