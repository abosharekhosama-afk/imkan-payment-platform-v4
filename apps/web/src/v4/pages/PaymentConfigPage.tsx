import React, {useEffect, useState} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {v4} from '../api/endpoints';
import {Alert, Button, Field, LoadingState, PageHeader} from '../design-system/components';
import {Can} from '../rbac/Can';
import {useToast} from '../hooks/useToast';
import {useI18n} from '../i18n/I18nProvider';

export function PaymentConfigPage() {
  const {t} = useI18n();
  const {token, hasPermission} = useAuth();
  const canManage = hasPermission('payment_config.manage');
  const {push} = useToast();
  const [form, setForm] = useState({
    company_display_name: '',
    brand_primary_color: '#0b6e4f',
    brand_secondary_color: '#0f1c2e',
    support_email: '',
    description: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    v4.paymentConfig(token)
      .then((cfg) => {
        setForm({
          company_display_name: cfg.company_display_name || '',
          brand_primary_color: cfg.brand_primary_color || '#0b6e4f',
          brand_secondary_color: cfg.brand_secondary_color || '#0f1c2e',
          support_email: cfg.support_email || '',
          description: cfg.description || '',
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    try {
      await v4.putPaymentConfig(token, form);
      push('Payment configuration saved');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title={t('paymentConfig.title')}
        description={t('paymentConfig.description')}
        crumbs={[{label: t('section.payments')}, {label: t('nav.paymentConfig')}]}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <form className="v4-card" onSubmit={save} style={{maxWidth: 560}}>
        <fieldset disabled={!canManage} style={{border: 0, margin: 0, padding: 0}}>
          <Field label={t('paymentConfig.companyDisplayName')}>
            <input
              value={form.company_display_name}
              onChange={(e) => setForm({...form, company_display_name: e.target.value})}
            />
          </Field>
          <Field label={t('paymentConfig.primaryColor')}>
            <input
              value={form.brand_primary_color}
              onChange={(e) => setForm({...form, brand_primary_color: e.target.value})}
            />
          </Field>
          <Field label={t('paymentConfig.secondaryColor')}>
            <input
              value={form.brand_secondary_color}
              onChange={(e) => setForm({...form, brand_secondary_color: e.target.value})}
            />
          </Field>
          <Field label={t('paymentConfig.supportEmail')}>
            <input
              type="email"
              value={form.support_email}
              onChange={(e) => setForm({...form, support_email: e.target.value})}
            />
          </Field>
          <Field label={t('paymentConfig.descriptionField')}>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
            />
          </Field>
        </fieldset>
        <Can anyOf={['payment_config.manage']}>
          <Button type="submit">{t('common.save')}</Button>
        </Can>
      </form>
    </div>
  );
}
