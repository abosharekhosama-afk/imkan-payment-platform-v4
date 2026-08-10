import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {formatDate, shortId} from '../../utils/money';

export function KybPage() {
  const {token} = useAuth();
  const {push} = useToast();
  const [kyb, setKyb] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([v4.kyb(token), v4.documents(token).catch(() => [])])
      .then(([k, d]) => {
        setKyb(k);
        setDocs(d || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [token]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="KYB"
        description="Know Your Business case status. External vendor automation is not enabled (DEC-010)."
        crumbs={[{label: 'Merchant'}, {label: 'KYB'}]}
        actions={
          <Can anyOf={['kyb.submit']}>
            <Button
              type="button"
              onClick={() =>
                void v4
                  .kybSubmit(token, {})
                  .then(() => {
                    push('KYB submitted for review');
                    load();
                  })
                  .catch((e) => setError(e.message))
              }
            >
              Submit for review
            </Button>
          </Can>
        }
      />
      <Alert tone="warning">
        Verification is <strong>manual / stub</strong> on the platform side. This is not an automated KYB vendor
        integration.
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card" style={{marginBottom: 16}}>
        <p>
          Status: <StatusBadge status={kyb?.status || kyb?.case?.status || 'UNKNOWN'} />
        </p>
        <pre style={{whiteSpace: 'pre-wrap', fontSize: 13}}>{JSON.stringify(kyb, null, 2)}</pre>
      </div>
      <div className="v4-card">
        <h3>Documents</h3>
        <DataTable
          columns={['Document', 'Type', 'Status', 'Created']}
          rows={docs.map((d) => [
            shortId(d.id),
            d.document_type_code || d.type || '—',
            <StatusBadge status={d.status} />,
            formatDate(d.created_at),
          ])}
          empty={<p style={{color: 'var(--v4-text-muted)'}}>No documents uploaded.</p>}
        />
      </div>
    </div>
  );
}
