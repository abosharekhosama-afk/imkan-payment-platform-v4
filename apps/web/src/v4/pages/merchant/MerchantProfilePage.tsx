import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useMasterOptions} from '../../hooks/useMasterOptions';
import {useI18n} from '../../i18n/I18nProvider';

export function MerchantProfilePage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('merchant.manage');
  const {push} = useToast();
  const entityTypes = useMasterOptions(token, 'legal-entity-types');
  const countries = useMasterOptions(token, 'countries');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [legal, setLegal] = useState({
    legal_name: '',
    trading_name: '',
    registration_number: '',
    legal_entity_type_code: 'LLC',
    incorporation_country_code: 'SA',
    incorporation_date: '',
  });
  const [address, setAddress] = useState({
    line1: '',
    line2: '',
    city: '',
    state_region: '',
    postal_code: '',
    country_code: 'SA',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.merchantProfile(token)
      .then((p) => {
        const lp = p?.legal_profile || {};
        const registered =
          (p?.addresses || []).find((a: any) => a.address_type_code === 'REGISTERED') || {};
        setLegal({
          legal_name: lp.legal_name || '',
          trading_name: lp.trading_name || '',
          registration_number: lp.registration_number || '',
          legal_entity_type_code: lp.legal_entity_type_code || 'LLC',
          incorporation_country_code: lp.incorporation_country_code || 'SA',
          incorporation_date: lp.incorporation_date
            ? String(lp.incorporation_date).slice(0, 10)
            : '',
        });
        setAddress({
          line1: registered.line1 || '',
          line2: registered.line2 || '',
          city: registered.city || '',
          state_region: registered.state_region || '',
          postal_code: registered.postal_code || '',
          country_code: registered.country_code || lp.incorporation_country_code || 'SA',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title={t('merchant.profile.title')}
        description={t('merchant.profile.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.profile')}]}
        actions={
          <Link to="/onboarding">
            <Button type="button" variant="secondary">
              {t('merchant.profile.backOnboarding')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Alert tone="info">{t('merchant.profile.requiredAlert')}</Alert>

      <form
        className="v4-card"
        style={{maxWidth: 720, marginTop: 16}}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage || !token) return;
          setSaving(true);
          setError('');
          void v4
            .putLegalProfile(token, {
              legal_name: legal.legal_name.trim(),
              trading_name: legal.trading_name.trim() || undefined,
              registration_number: legal.registration_number.trim(),
              legal_entity_type_code: legal.legal_entity_type_code,
              incorporation_country_code: legal.incorporation_country_code,
              incorporation_date: legal.incorporation_date || undefined,
              addresses: [
                {
                  address_type_code: 'REGISTERED',
                  line1: address.line1.trim(),
                  line2: address.line2.trim() || undefined,
                  city: address.city.trim(),
                  state_region: address.state_region.trim() || undefined,
                  postal_code: address.postal_code.trim() || undefined,
                  country_code: address.country_code,
                },
              ],
            })
            .then(() => {
              push('Legal profile and registered address saved');
              load();
            })
            .catch((err) => setError(err.message))
            .finally(() => setSaving(false));
        }}
      >
        <h3>{t('merchant.profile.legalSection')}</h3>
        <fieldset disabled={!canManage || saving} style={{border: 0, margin: 0, padding: 0}}>
          <Field label={t('merchant.profile.legalName')}>
            <input
              required
              value={legal.legal_name}
              onChange={(e) => setLegal({...legal, legal_name: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.tradingName')}>
            <input
              value={legal.trading_name}
              onChange={(e) => setLegal({...legal, trading_name: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.regNumber')}>
            <input
              required
              value={legal.registration_number}
              onChange={(e) => setLegal({...legal, registration_number: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.entityType')}>
            <select
              required
              value={legal.legal_entity_type_code}
              onChange={(e) => setLegal({...legal, legal_entity_type_code: e.target.value})}
            >
              {entityTypes.options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('merchant.profile.incorpCountry')}>
            <select
              required
              value={legal.incorporation_country_code}
              onChange={(e) => setLegal({...legal, incorporation_country_code: e.target.value})}
            >
              {countries.options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('merchant.profile.incorpDate')}>
            <input
              type="date"
              value={legal.incorporation_date}
              onChange={(e) => setLegal({...legal, incorporation_date: e.target.value})}
            />
          </Field>

          <h3 style={{marginTop: '1.5rem'}}>{t('merchant.profile.addressSection')}</h3>
          <Field label={t('merchant.profile.address1')}>
            <input
              required
              value={address.line1}
              onChange={(e) => setAddress({...address, line1: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.address2')}>
            <input
              value={address.line2}
              onChange={(e) => setAddress({...address, line2: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.city')}>
            <input
              required
              value={address.city}
              onChange={(e) => setAddress({...address, city: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.state')}>
            <input
              value={address.state_region}
              onChange={(e) => setAddress({...address, state_region: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.postal')}>
            <input
              value={address.postal_code}
              onChange={(e) => setAddress({...address, postal_code: e.target.value})}
            />
          </Field>
          <Field label={t('merchant.profile.country')}>
            <select
              required
              value={address.country_code}
              onChange={(e) => setAddress({...address, country_code: e.target.value})}
            >
              {countries.options.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </Field>
        </fieldset>
        <Can anyOf={['merchant.manage']}>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('merchant.profile.save')}
          </Button>
        </Can>
      </form>
    </div>
  );
}
