import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';

export function ProvidersPage() {
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [caps, setCaps] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.providers(token)
      .then(async (providers) => {
        setRows(providers);
        const sandbox = providers.find((p: any) => p.code === 'sandbox');
        if (sandbox) setCaps(await v4.providerCapabilities(token, sandbox.code));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title="Providers"
        description="Only the internal Sandbox adapter is registered on the V4 Router."
        crumbs={[{label: 'Providers'}, {label: 'Catalog'}]}
      />
      <Alert tone="warning">
        <strong>No real external providers are active.</strong> LIVE configuration for sandbox is unsupported
        (`supports_live=false`). Do not interpret this catalog as production readiness.
      </Alert>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            columns={['Code', 'Name', 'Status', 'Sandbox', 'Live']}
            rows={rows.map((r) => [
              r.code,
              r.name,
              <StatusBadge status={r.status} />,
              r.supports_sandbox ? <StatusBadge status="SANDBOX" /> : '—',
              r.supports_live ? <StatusBadge status="LIVE" /> : <StatusBadge status="DISABLED" />,
            ])}
          />
          <div className="v4-card" style={{marginTop: 16}}>
            <h3>Sandbox capabilities</h3>
            <DataTable
              columns={['Capability', 'Evidence', 'Scope', 'Notes']}
              rows={caps.map((c) => [
                c.capability_code,
                <StatusBadge status={c.evidence_status} />,
                c.environment_scope,
                c.notes || '—',
              ])}
            />
          </div>
        </>
      )}
    </div>
  );
}
