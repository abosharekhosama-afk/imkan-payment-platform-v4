import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';

export function BusinessPage() {
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('merchant.manage');
  const {push} = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    website: '',
    industry_code: '',
    business_type_code: '',
  });

  useEffect(() => {
    if (!token) return;
    v4.merchantProfile(token)
      .then((p) => {
        const b = p?.business_profile || p || {};
        setForm({
          website: b.website || '',
          industry_code: b.industry_code || '',
          business_type_code: b.business_type_code || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Business profile"
        description="PUT /api/v1/merchant/business-profile"
        crumbs={[{label: 'Merchant'}, {label: 'Business'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form
        className="v4-card"
        style={{maxWidth: 560}}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage) return;
          void v4
            .putBusinessProfile(token, {
              website: form.website || undefined,
              industry_code: form.industry_code || undefined,
              business_type_code: form.business_type_code || undefined,
            })
            .then(() => push('Business profile saved'))
            .catch((err) => setError(err.message));
        }}
      >
        <fieldset disabled={!canManage} style={{border: 0, margin: 0, padding: 0}}>
        <Field label="Website">
          <input value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} />
        </Field>
        <Field label="Industry code">
          <input value={form.industry_code} onChange={(e) => setForm({...form, industry_code: e.target.value})} />
        </Field>
        <Field label="Business type code">
          <input
            value={form.business_type_code}
            onChange={(e) => setForm({...form, business_type_code: e.target.value})}
          />
        </Field>
        </fieldset>
        <Can anyOf={['merchant.manage']}>
          <Button type="submit">Save</Button>
        </Can>
      </form>
    </div>
  );
}
