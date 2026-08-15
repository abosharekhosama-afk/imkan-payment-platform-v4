import React from 'react';
import {Outlet} from 'react-router-dom';
import {ModuleTabs, PageHeader} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';

export function MerchantHubPage() {
  const {t} = useI18n();
  const items = [
    {to: '/merchant/profile', label: t('onboarding.stepLegal')},
    {to: '/merchant/business', label: t('onboarding.stepBusiness')},
    {to: '/merchant/people', label: t('onboarding.stepPeople')},
    {to: '/merchant/documents', label: t('onboarding.stepDocuments')},
    {to: '/merchant/kyb', label: t('onboarding.stepKyb')},
  ];
  return (
    <div>
      <PageHeader
        title={t('merchant.hub.title')}
        description={t('merchant.hub.description')}
        crumbs={[{label: t('section.business')}]}
      />
      <ModuleTabs items={items} />
      <Outlet />
    </div>
  );
}
