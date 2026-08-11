import React, {useEffect, useState} from 'react';
import {useParams} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';
import {useI18n} from '../../i18n/I18nProvider';

export function SubscriptionDetailPage() {
  const {t} = useI18n();
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
        title={t('subscriptionDetail.title', {id: shortId(row.id)})}
        crumbs={[
          {label: t('section.billing')},
          {label: t('nav.subscriptions'), to: '/subscriptions'},
          {label: t('common.detail')},
        ]}
        actions={
          <>
            <Can anyOf={['subscriptions.pause', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="secondary" type="button" onClick={() => void act('pause')}>
                {t('common.pause')}
              </Button>
            </Can>
            <Can anyOf={['subscriptions.resume', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="secondary" type="button" onClick={() => void act('resume')}>
                {t('common.resume')}
              </Button>
            </Can>
            <Can anyOf={['subscriptions.cancel', 'subscriptions.manage', 'billing.manage']}>
              <Button variant="danger" type="button" onClick={() => void act('cancel')}>
                {t('common.cancel')}
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
        <p>
          {t('subscriptionDetail.labelCustomer')} {shortId(row.customer_id)}
        </p>
        <p>
          {t('subscriptionDetail.labelPrice')} {shortId(row.price_id)}
        </p>
        <p>
          {t('subscriptionDetail.labelNextBilling')} {formatDate(row.next_billing_at)}
        </p>
        <p>
          {t('subscriptionDetail.labelPeriodEnd')} {formatDate(row.current_period_end)}
        </p>
      </div>
    </div>
  );
}
