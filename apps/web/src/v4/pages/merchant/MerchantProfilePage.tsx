import React, {useEffect, useState} from 'react';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';

export function MerchantProfilePage() {
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('merchant.manage');
  const {push} = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [legal, setLegal] = useState({legal_name: '', trading_name: '', registration_number: ''});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    v4.merchantProfile(token)
      .then((p) => {
        setProfile(p);
        setLegal({
          legal_name: p?.legal_name || p?.legal_profile?.legal_name || '',
          trading_name: p?.trading_name || p?.legal_profile?.trading_name || '',
          registration_number: p?.registration_number || p?.legal_profile?.registration_number || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Merchant profile"
        description="V4 merchant profile and legal information."
        crumbs={[{label: 'Merchant'}, {label: 'Profile'}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="v4-card" style={{marginBottom: 16}}>
        <h3>Profile</h3>
        <pre style={{whiteSpace: 'pre-wrap', fontSize: 13}}>{JSON.stringify(profile, null, 2)}</pre>
      </div>
      <form
        className="v4-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage) return;
          void v4
            .putLegalProfile(token, legal)
            .then(() => push('Legal profile saved'))
            .catch((err) => setError(err.message));
        }}
      >
        <h3>Legal information</h3>
        <fieldset disabled={!canManage} style={{border: 0, margin: 0, padding: 0}}>
        <Field label="Legal name">
          <input value={legal.legal_name} onChange={(e) => setLegal({...legal, legal_name: e.target.value})} />
        </Field>
        <Field label="Trading name">
          <input value={legal.trading_name} onChange={(e) => setLegal({...legal, trading_name: e.target.value})} />
        </Field>
        <Field label="Registration number">
          <input
            value={legal.registration_number}
            onChange={(e) => setLegal({...legal, registration_number: e.target.value})}
          />
        </Field>
        </fieldset>
        <Can anyOf={['merchant.manage']}>
          <Button type="submit">Save legal profile</Button>
        </Can>
      </form>
    </div>
  );
}
