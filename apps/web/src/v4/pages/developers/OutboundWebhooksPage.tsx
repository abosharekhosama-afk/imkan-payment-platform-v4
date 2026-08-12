import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {
  Alert,
  Button,
  Field,
  LoadingState,
  Modal,
  PageHeader,
  StatusBadge,
} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useI18n} from '../../i18n/I18nProvider';
import {formatDate, shortId} from '../../utils/money';

const DEFAULT_EVENTS = ['payment.succeeded', 'payment.failed', 'refund.succeeded'];

export function OutboundWebhooksPage() {
  const {t} = useI18n();
  const {token} = useAuth();
  const {push} = useToast();
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [retryBusyId, setRetryBusyId] = useState('');
  const [form, setForm] = useState({
    url: '',
    description: '',
    subscribed_events: DEFAULT_EVENTS.join(', '),
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.merchantWebhookEndpoints(token), v4.merchantWebhookDeliveries(token)])
      .then(([eps, dels]) => {
        setEndpoints(eps);
        setDeliveries(dels);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const events = form.subscribed_events
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await v4.createMerchantWebhookEndpoint(token, {
        url: form.url,
        description: form.description || undefined,
        subscribed_events: events.length ? events : DEFAULT_EVENTS,
      });
      setSecretOnce(created.secret || null);
      setOpen(false);
      setForm({url: '', description: '', subscribed_events: DEFAULT_EVENTS.join(', ')});
      push(t('outboundWebhooks.created'));
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggle = async (row: any) => {
    try {
      await v4.updateMerchantWebhookEndpoint(token, row.id, {
        status: row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
      });
      push(t('outboundWebhooks.updated'));
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const retryDelivery = async (deliveryId: string) => {
    if (!token) return;
    setRetryBusyId(deliveryId);
    setError('');
    try {
      await v4.retryMerchantWebhookDelivery(token, deliveryId);
      push(t('outboundWebhooks.retried'));
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRetryBusyId('');
    }
  };

  return (
    <div>
      <PageHeader
        title={t('outboundWebhooks.title')}
        description={t('outboundWebhooks.description')}
        crumbs={[{label: t('section.developers')}, {label: t('nav.outboundWebhooks')}]}
        actions={
          <Can anyOf={['webhooks.manage']}>
            <Button type="button" onClick={() => setOpen(true)}>
              {t('outboundWebhooks.create')}
            </Button>
          </Can>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {secretOnce ? (
        <Alert tone="warning">
          {t('outboundWebhooks.secretOnce')}: <code>{secretOnce}</code>
        </Alert>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <h3>{t('outboundWebhooks.endpoints')}</h3>
          <div className="v4-table-wrap">
            <table className="v4-table">
              <thead>
                <tr>
                  <th>{t('outboundWebhooks.colEndpoint')}</th>
                  <th>URL</th>
                  <th>{t('outboundWebhooks.colEvents')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.length ? (
                  endpoints.map((r) => (
                    <tr key={r.id}>
                      <td>{shortId(r.id)}</td>
                      <td style={{maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis'}}>{r.url}</td>
                      <td>{Array.isArray(r.subscribed_events) ? r.subscribed_events.join(', ') : '—'}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <Can anyOf={['webhooks.manage']}>
                          <Button type="button" onClick={() => void toggle(r)}>
                            {r.status === 'ACTIVE' ? t('outboundWebhooks.disable') : t('outboundWebhooks.enable')}
                          </Button>
                        </Can>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>{t('outboundWebhooks.empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h3 style={{marginTop: '1.5rem'}}>{t('outboundWebhooks.deliveries')}</h3>
          <div className="v4-table-wrap">
            <table className="v4-table">
              <thead>
                <tr>
                  <th>{t('outboundWebhooks.colDelivery')}</th>
                  <th>{t('outboundWebhooks.colEvent')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('outboundWebhooks.colAttempt')}</th>
                  <th>{t('common.created')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.length ? (
                  deliveries.map((d) => (
                    <tr key={d.id}>
                      <td>{shortId(d.id)}</td>
                      <td>{d.event_type}</td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                      <td>{d.attempt}</td>
                      <td>{formatDate(d.created_at)}</td>
                      <td>
                        {['FAILED', 'DEAD', 'PENDING'].includes(d.status) ? (
                          <Can anyOf={['webhooks.manage']}>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={retryBusyId === d.id}
                              onClick={() => void retryDelivery(d.id)}
                            >
                              {t('outboundWebhooks.retry')}
                            </Button>
                          </Can>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>{t('outboundWebhooks.deliveriesEmpty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {open ? (
        <Modal title={t('outboundWebhooks.modalTitle')} onClose={() => setOpen(false)}>
          <form onSubmit={create}>
            <Field label="URL" hint={t('outboundWebhooks.urlHint')}>
              <input
                required
                type="url"
                value={form.url}
                onChange={(e) => setForm({...form, url: e.target.value})}
                placeholder="https://books.example/webhooks/payments"
              />
            </Field>
            <Field label={t('common.description')}>
              <input
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
              />
            </Field>
            <Field label={t('outboundWebhooks.events')} hint={t('outboundWebhooks.eventsHint')}>
              <input
                value={form.subscribed_events}
                onChange={(e) => setForm({...form, subscribed_events: e.target.value})}
              />
            </Field>
            <Button type="submit">{t('common.create')}</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
