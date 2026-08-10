import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, DataTable, LoadingState, PageHeader, StatusBadge} from '../../design-system/components';
import {formatDate, shortId} from '../../utils/money';

export function DocumentsPage() {
  const {token} = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.documents(token)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Merchant KYB documents from GET /api/v1/merchant/documents."
        crumbs={[{label: 'Merchant'}, {label: 'Documents'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <DataTable
          columns={['Document', 'Type', 'Status', 'Created']}
          rows={rows.map((d) => [
            shortId(d.id),
            d.document_type_code || d.type || '—',
            <StatusBadge status={d.status} />,
            formatDate(d.created_at),
          ])}
        />
      )}
    </div>
  );
}
