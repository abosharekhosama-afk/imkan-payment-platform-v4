import React from 'react';
import {Outlet} from 'react-router-dom';
import {ModuleTabs, PageHeader} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';

export function SettingsHubPage() {
  const {t} = useI18n();
  const items = [
    {to: '/settings/organization', label: t('nav.organization')},
    {to: '/settings/payments', label: t('nav.paymentConfig')},
    {to: '/settings/appearance', label: t('nav.appearance')},
    {to: '/settings/webhooks', label: t('nav.webhooks')},
  ];
  return (
    <div>
      <PageHeader
        title={t('settings.hub.title')}
        description={t('settings.hub.description')}
        crumbs={[{label: t('section.settings')}]}
      />
      <ModuleTabs items={items} />
      <Outlet />
    </div>
  );
}
