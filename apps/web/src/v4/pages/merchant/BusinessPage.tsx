import React, {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../../auth/AuthProvider';
import {v4} from '../../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../../design-system/components';
import {FormSection} from '../../components/FormSection';
import {Can} from '../../rbac/Can';
import {useToast} from '../../hooks/useToast';
import {useMasterOptions} from '../../hooks/useMasterOptions';
import {useI18n} from '../../i18n/I18nProvider';

export function BusinessPage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('merchant.manage');
  const {push} = useToast();
  const industries = useMasterOptions(token, 'industries');
  const businessTypes = useMasterOptions(token, 'business-types');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    website: '',
    industry_code: 'ECOMMERCE',
    business_type_code: 'SERVICES',
    description: '',
    products_services: '',
  });

  const load = () => {
    if (!token) return;
    setLoading(true);
    v4.merchantProfile(token)
      .then((p) => {
        const b = p?.business_profile || {};
        setForm({
          website: b.website || '',
          industry_code: b.industry_code || 'ECOMMERCE',
          business_type_code: b.business_type_code || 'SERVICES',
          description: b.description || '',
          products_services: b.products_services || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  if (loading) return <LoadingState label={t('merchant.business.loading')} />;

  return (
    <div className="v4-form-page">
      <PageHeader
        title={t('merchant.business.title')}
        description={t('merchant.business.description')}
        crumbs={[{label: t('section.merchant')}, {label: t('nav.business')}]}
        actions={
          <Link to="/onboarding">
            <Button type="button" variant="secondary">
              {t('merchant.profile.backOnboarding')}
            </Button>
          </Link>
        }
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canManage || !token) return;
          setSaving(true);
          setError('');
          const website = form.website.trim();
          void v4
            .putBusinessProfile(token, {
              website: website || undefined,
              industry_code: form.industry_code,
              business_type_code: form.business_type_code,
              description: form.description.trim(),
              products_services: form.products_services.trim() || undefined,
            })
            .then(() => {
              push(t('toast.businessProfileSaved'));
              load();
            })
            .catch((err) => setError(err.message))
            .finally(() => setSaving(false));
        }}
      >
        <fieldset disabled={!canManage || saving} style={{border: 0, margin: 0, padding: 0}}>
          <FormSection title={t('merchant.business.classification')} description={t('merchant.business.classificationHint')}>
            <Field label={t('merchant.business.industry')} hint={t('merchant.business.industryHint')}>
              <select required value={form.industry_code} onChange={(e) => setForm({...form, industry_code: e.target.value})}>
                {industries.options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('merchant.business.type')}>
              <select
                required
                value={form.business_type_code}
                onChange={(e) => setForm({...form, business_type_code: e.target.value})}
              >
                {businessTypes.options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('merchant.business.website')} hint={t('merchant.business.websiteHint')}>
              <input type="url" placeholder="https://" value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} />
            </Field>
          </FormSection>

          <FormSection title={t('merchant.business.aboutSection')} description={t('merchant.business.aboutSectionHint')}>
            <Field label={t('merchant.business.descriptionField')} hint={t('merchant.business.descriptionHint')} fullWidth>
              <textarea
                required
                rows={4}
                className="v4-textarea"
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
              />
            </Field>
            <Field label={t('merchant.business.products')} fullWidth>
              <textarea
                rows={3}
                className="v4-textarea"
                value={form.products_services}
                onChange={(e) => setForm({...form, products_services: e.target.value})}
              />
            </Field>
          </FormSection>
        </fieldset>
        <Can anyOf={['merchant.manage']}>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('merchant.business.save')}
          </Button>
        </Can>
      </form>
    </div>
  );
}
