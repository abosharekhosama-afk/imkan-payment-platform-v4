import React from 'react';
import {useParams} from 'react-router-dom';
import {ComingSoon} from '../design-system/components';

const COPY: Record<string, {feature: string; reason: string}> = {
  refunds: {
    feature: 'Refunds',
    reason: 'Sandbox refund capability is UNSUPPORTED; V4 refund APIs are deferred to Financial Core / provider evidence.',
  },
  balances: {
    feature: 'Balances',
    reason: 'No V4 ledger or balance projection exists (Phase 7).',
  },
  settlements: {
    feature: 'Settlements',
    reason: 'Settlement requires Financial Core and provider settlement reports.',
  },
  payouts: {
    feature: 'Payouts',
    reason: 'Bank account storage exists; money-movement payouts are not implemented.',
  },
  reconciliation: {
    feature: 'Reconciliation',
    reason: 'No V4 reconciliation engine.',
  },
  risk: {
    feature: 'Risk',
    reason: 'Risk assessments are not part of V4 PostgreSQL APIs yet.',
  },
  disputes: {
    feature: 'Disputes',
    reason: 'Dispute management is not implemented on /api/v1.',
  },
  reports: {
    feature: 'Reports',
    reason: 'Financial reporting depends on ledger and later analytics work.',
  },
  ledger: {
    feature: 'Ledger',
    reason: 'Financial Core (Phase 7) has not started.',
  },
};

export function ComingSoonPage() {
  const {feature = 'ledger'} = useParams();
  const copy = COPY[feature] || {
    feature: feature,
    reason: 'This capability is not available on the V4 API yet.',
  };
  return <ComingSoon feature={copy.feature} reason={copy.reason} />;
}
