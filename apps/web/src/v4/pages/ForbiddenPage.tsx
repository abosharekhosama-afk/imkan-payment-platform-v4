import React from 'react';
import {Link} from 'react-router-dom';
import {PageHeader} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';

export function ForbiddenPage() {
  const {t} = useI18n();

  return (
    <div>
      <PageHeader
        title={t('forbidden.title')}
        description={t('forbidden.description')}
        crumbs={[{label: t('section.security')}]}
      />
      <p>
        <Link to="/">{t('forbidden.returnDashboard')}</Link>
      </p>
    </div>
  );
}
