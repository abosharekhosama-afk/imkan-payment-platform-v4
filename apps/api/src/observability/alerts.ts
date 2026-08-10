/**
 * Alert threshold definitions (P15.2 baseline).
 * Evaluation is in-process against metrics snapshot; wire to pager later.
 */
import {getMetric, type MetricName} from './metrics.js';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertRule = {
  id: string;
  description: string;
  metric: MetricName;
  labels?: Record<string, string>;
  threshold: number;
  severity: AlertSeverity;
};

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'webhook_failures',
    description: 'Provider webhook verification/apply failures',
    metric: 'webhook_failures_total',
    threshold: 5,
    severity: 'critical',
  },
  {
    id: 'payment_failures',
    description: 'Payment authorization/capture failures',
    metric: 'payment_failures_total',
    threshold: 20,
    severity: 'warning',
  },
  {
    id: 'ambiguous_payments',
    description: 'Ambiguous provider payment outcomes requiring investigation',
    metric: 'ambiguous_payments_total',
    threshold: 3,
    severity: 'critical',
  },
  {
    id: 'refund_failures',
    description: 'Refund failures',
    metric: 'refund_failures_total',
    threshold: 5,
    severity: 'warning',
  },
  {
    id: 'settlement_failures',
    description: 'Settlement finalize/cancel failures',
    metric: 'settlement_failures_total',
    threshold: 3,
    severity: 'critical',
  },
  {
    id: 'payout_failures',
    description: 'Payout lifecycle failures (sandbox or future live)',
    metric: 'payout_failures_total',
    threshold: 3,
    severity: 'critical',
  },
  {
    id: 'auth_failures',
    description: 'Authentication failures (credential stuffing signal)',
    metric: 'auth_failures_total',
    threshold: 50,
    severity: 'warning',
  },
  {
    id: 'outbox_failures',
    description: 'Outbox delivery permanently failed',
    metric: 'outbox_failures_total',
    threshold: 1,
    severity: 'critical',
  },
  {
    id: 'rate_limit_hits',
    description: 'Rate limit rejections',
    metric: 'rate_limit_hits_total',
    threshold: 100,
    severity: 'info',
  },
];

export type AlertEvaluation = {
  id: string;
  firing: boolean;
  value: number;
  threshold: number;
  severity: AlertSeverity;
  description: string;
};

export function evaluateAlerts(rules: AlertRule[] = ALERT_RULES): AlertEvaluation[] {
  return rules.map((rule) => {
    const value = getMetric(rule.metric, rule.labels);
    return {
      id: rule.id,
      firing: value >= rule.threshold,
      value,
      threshold: rule.threshold,
      severity: rule.severity,
      description: rule.description,
    };
  });
}
