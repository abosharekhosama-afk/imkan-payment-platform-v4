import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  DataTable,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';

export function PlatformWebhooksPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [retryAllBusy, setRetryAllBusy] = useState(false);

  const buildQuery = () => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (orgFilter.trim()) q.set('organization_id', orgFilter.trim());
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4
      .platformWebhookDeliveries(token, buildQuery())
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const retryOne = async (deliveryId: string) => {
    if (!token) return;
    setBusyId(deliveryId);
    setError('');
    try {
      await v4.retryPlatformWebhookDelivery(token, deliveryId);
      push(t('platform.webhooks.retried'));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const retryFailed = async () => {
    if (!token) return;
    setRetryAllBusy(true);
    setError('');
    try {
      const result = await v4.retryFailedPlatformWebhooks(
        token,
        orgFilter.trim() ? {organization_id: orgFilter.trim()} : {},
      );
      push(t('platform.webhooks.retryFailedDone', {count: result?.retried ?? 0}));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRetryAllBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('platform.webhooks.title')}
        description={t('platform.webhooks.description')}
        crumbs={[{label: t('section.platform')}, {label: t('nav.platformWebhooks')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-toolbar" style={{marginBottom: 12, flexWrap: 'wrap', gap: 8}}>
        <Field label={t('common.status')}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="PENDING">PENDING</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="FAILED">FAILED</option>
            <option value="DEAD">DEAD</option>
          </select>
        </Field>
        <Field label={t('platform.obs.orgFilter')}>
          <input
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            placeholder={t('platform.obs.orgFilterHint')}
          />
        </Field>
        <Button type="button" variant="secondary" onClick={load} style={{alignSelf: 'end'}}>
          {t('common.refresh')}
        </Button>
        <Can anyOf={['webhooks.manage', 'platform.admin']}>
          <Button
            type="button"
            variant="secondary"
            disabled={retryAllBusy}
            onClick={() => void retryFailed()}
            style={{alignSelf: 'end'}}
          >
            {t('platform.webhooks.retryFailed')}
          </Button>
        </Can>
      </div>
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={[
            t('platform.obs.colOrg'),
            t('platform.webhooks.colEndpoint'),
            t('outboundWebhooks.colEvent'),
            t('common.status'),
            t('outboundWebhooks.colAttempt'),
            t('platform.webhooks.colResponse'),
            t('common.created'),
            t('common.actions'),
          ]}
          rows={rows.map((d) => [
            d.organization_name ? (
              <Link to={`/platform/organizations/${d.organization_id}`}>{d.organization_name}</Link>
            ) : (
              shortId(d.organization_id)
            ),
            <span style={{maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {d.endpoint_url || shortId(d.endpoint_id)}
            </span>,
            d.event_type,
            <StatusBadge status={d.status} />,
            d.attempt ?? '—',
            d.response_code ?? d.last_error ?? '—',
            formatDate(d.created_at),
            ['FAILED', 'DEAD', 'PENDING'].includes(d.status) ? (
              <Can anyOf={['webhooks.manage', 'platform.admin']}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === d.id}
                  onClick={() => void retryOne(d.id)}
                >
                  {t('platform.webhooks.retry')}
                </Button>
              </Can>
            ) : (
              '—'
            ),
          ])}
          empty={<p>{t('platform.webhooks.empty')}</p>}
        />
      )}
    </div>
  );
}
