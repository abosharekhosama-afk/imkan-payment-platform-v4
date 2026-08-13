import React, {useEffect, useState} from 'react';
import {Link, useParams} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {checkoutWebUrl} from '../api/client';
import {v4} from '../api/endpoints';
import {Alert, Button, LoadingState, PageHeader, StatusBadge} from '../design-system/components';
import {Can} from '../rbac/Can';
import {useToast} from '../hooks/useToast';
import {formatDate, formatMoney} from '../utils/money';
import {useI18n} from '../i18n/I18nProvider';
import {useBusyAction} from '../hooks/useBusyAction';

export function PaymentLinkDetailPage() {
  const {t} = useI18n();
  const {id = ''} = useParams();
  const {token} = useAuth();
  const {push} = useToast();
  const {busy, busyKey, run} = useBusyAction();
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
    await run(async () => {
      try {
        await v4.paymentLinkAction(token, id, action);
        push(`Link ${action}`);
        load();
      } catch (e: any) {
        setError(e.message);
      }
    }, action);
  };

  if (!row && !error) return <LoadingState />;
  if (error && !row) return <Alert tone="danger">{error}</Alert>;

  const webUrl = checkoutWebUrl(row.public_token);
  const maxUses = row.max_uses != null ? ` / ${row.max_uses}` : '';
  const canActivate = row.status === 'DRAFT' || row.status === 'INACTIVE';
  const canDeactivate = row.status === 'ACTIVE';
  const canCancel = ['DRAFT', 'ACTIVE', 'INACTIVE'].includes(row.status);

  return (
    <div className="v4-detail-page">
      <PageHeader
        title={row.title}
        description={t('paymentLinkDetail.description')}
        crumbs={[
          {label: t('section.payments'), to: '/payments'},
          {label: t('nav.paymentLinks'), to: '/payment-links'},
          {label: t('common.detail')},
        ]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="v4-card v4-detail-card">
        <div className="v4-detail-meta">
          <StatusBadge status={row.status} />
          <strong className="v4-detail-amount">{formatMoney(row.amount_minor, row.currency_code)}</strong>
        </div>

        <Can anyOf={['payment_links.manage']}>
          {canActivate || canDeactivate || canCancel ? (
            <div className="v4-detail-actions">
              {canActivate ? (
                <Button type="button" busy={busyKey === 'activate'} onClick={() => void act('activate')}>
                  {t('paymentLinkDetail.activate')}
                </Button>
              ) : null}
              {canDeactivate ? (
                <Button
                  variant="secondary"
                  type="button"
                  busy={busyKey === 'deactivate'}
                  onClick={() => void act('deactivate')}
                >
                  {t('paymentLinkDetail.deactivate')}
                </Button>
              ) : null}
              {canCancel ? (
                <Button
                  variant="danger"
                  type="button"
                  busy={busyKey === 'cancel'}
                  disabled={busy}
                  onClick={() => void act('cancel')}
                >
                  {t('paymentLinkDetail.cancel')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Can>

        <div className="v4-detail-field">
          <span className="v4-detail-label">{t('paymentLinkDetail.checkoutUrl')}</span>
          <div className="v4-url-box">
            <a className="v4-url-text" href={webUrl} target="_blank" rel="noreferrer">
              {webUrl}
            </a>
          </div>
        </div>

        <div className="v4-detail-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(webUrl);
              push(t('toast.copied'));
            }}
          >
            {t('paymentLinkDetail.copyUrl')}
          </Button>
          <Link className="v4-btn-link" to={`/checkout/${row.public_token}`} target="_blank" rel="noreferrer">
            <Button type="button">{t('paymentLinkDetail.openCheckout')}</Button>
          </Link>
        </div>

        <p className="v4-detail-footnote">
          {t('paymentLinkDetail.createdUses', {
            date: formatDate(row.created_at),
            count: String(row.use_count ?? 0),
            max: maxUses,
          })}
        </p>
      </div>
    </div>
  );
}
