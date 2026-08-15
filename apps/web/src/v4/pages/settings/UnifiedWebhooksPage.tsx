import React, {useState} from 'react';
import {PageHeader} from '../../design-system/components';
import {useI18n} from '../../i18n/I18nProvider';
import {OutboundWebhooksPage} from '../developers/OutboundWebhooksPage';
import {WebhooksPage} from '../providers/WebhooksPage';

export function UnifiedWebhooksPage() {
  const {t} = useI18n();
  const [tab, setTab] = useState<'outbound' | 'inbound'>('outbound');
  return (
    <div>
      <PageHeader
        title={t('webhooks.hub.title')}
        description={t('webhooks.hub.description')}
        crumbs={[{label: t('section.settings')}, {label: t('nav.webhooks')}]}
      />
      <nav className="v4-module-tabs">
        <button type="button" className={tab === 'outbound' ? 'active' : ''} onClick={() => setTab('outbound')}>
          {t('webhooks.hub.outbound')}
        </button>
        <button type="button" className={tab === 'inbound' ? 'active' : ''} onClick={() => setTab('inbound')}>
          {t('webhooks.hub.inbound')}
        </button>
      </nav>
      {tab === 'outbound' ? <OutboundWebhooksPage embedded /> : <WebhooksPage embedded />}
    </div>
  );
}
