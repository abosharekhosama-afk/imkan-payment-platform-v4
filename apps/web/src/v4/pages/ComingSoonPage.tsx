import React from 'react';
import {useParams} from 'react-router-dom';
import {ComingSoon} from '../design-system/components';
import {useI18n} from '../i18n/I18nProvider';
import type {MessageKey} from '../i18n/messages/en';

const FEATURE_NAV: Record<string, MessageKey> = {
  refunds: 'nav.refunds',
  balances: 'nav.balances',
  settlements: 'nav.settlements',
  payouts: 'nav.payouts',
  reconciliation: 'nav.reconciliation',
  risk: 'nav.risk',
  disputes: 'nav.disputes',
  reports: 'nav.reports',
  ledger: 'nav.ledger',
};

const FEATURE_REASON: Record<string, MessageKey> = {
  refunds: 'comingSoon.reason.refunds',
  balances: 'comingSoon.reason.balances',
  settlements: 'comingSoon.reason.settlements',
  payouts: 'comingSoon.reason.payouts',
  reconciliation: 'comingSoon.reason.reconciliation',
  risk: 'comingSoon.reason.risk',
  disputes: 'comingSoon.reason.disputes',
  reports: 'comingSoon.reason.reports',
  ledger: 'comingSoon.reason.ledger',
};

export function ComingSoonPage() {
  const {t} = useI18n();
  const {feature = 'ledger'} = useParams();
  const navKey = FEATURE_NAV[feature];
  const reasonKey = FEATURE_REASON[feature];

  return (
    <ComingSoon
      feature={navKey ? t(navKey) : feature}
      reason={reasonKey ? t(reasonKey) : t('comingSoon.fallback')}
    />
  );
}
