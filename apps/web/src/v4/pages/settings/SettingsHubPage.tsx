import React from 'react';
import {Outlet} from 'react-router-dom';
import {ModuleTabs, PageHeader} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {useAuth} from '../../auth/AuthProvider';

export function SettingsHubPage() {
  const {t} = useI18n();
  const {isPlatform} = useAuth();
  const items = isPlatform
    ? [{to: '/settings/appearance', label: t('nav.appearance')}]
    : [
        {to: '/settings/organization', label: t('nav.organization')},
        {to: '/settings/payments', label: t('nav.paymentConfig')},
        {to: '/settings/appearance', label: t('nav.appearance')},
        {to: '/settings/webhooks', label: t('nav.webhooks')},
      ];
  return (
    <div>
      <PageHeader
        title={t('settings.hub.title')}
        description={isPlatform ? t('settings.hub.descriptionPlatform') : t('settings.hub.description')}
        crumbs={[{label: t('section.settings')}]}
      />
      {items.length > 1 ? <ModuleTabs items={items} /> : null}
      <Outlet />
    </div>
  );
}
