import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {formatDate, shortId} from '../../utils/money';

export function WebhooksPage() {
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.providerWebhooks(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title="Provider webhook events"
        description="Inbound provider webhooks received by V4."
        crumbs={[{label: 'Providers'}, {label: 'Webhook Events'}]}
      />
      <Alert tone="info">
        Verified webhooks are signature-checked, replay-protected, deduplicated, then applied to Payment Intent state
        (and ledger on success / refund events) via the webhook state-apply path. “PROCESSED” means the event was
        handled; always confirm PI status and ledger for financial truth. Live providers remain BLOCKED BY: DEC-009.
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Event', 'Provider', 'Type', 'Signature', 'Status', 'Received']}
          rows={rows.map((r) => [
            shortId(r.id),
            r.provider_code || '—',
            r.event_type || '—',
            r.signature_valid === true ? 'valid' : r.signature_valid === false ? 'invalid' : '—',
            <StatusBadge status={r.status} />,
            formatDate(r.received_at || r.created_at),
          ])}
        />
      )}
    </div>
  );
}
