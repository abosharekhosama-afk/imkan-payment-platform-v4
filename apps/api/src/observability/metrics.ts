/**
 * In-process metrics baseline (P15.2).
 * Suitable for single-instance / scrape; production scrapers can poll /api/v1/metrics.
 * Multi-instance aggregation is ops-layer (Prometheus/etc.) — not claimed here.
 */
export type MetricName =
  | 'http_requests_total'
  | 'provider_requests_total'
  | 'provider_failures_total'
  | 'webhook_failures_total'
  | 'payment_failures_total'
  | 'ambiguous_payments_total'
  | 'refund_failures_total'
  | 'settlement_failures_total'
  | 'payout_failures_total'
  | 'auth_failures_total'
  | 'security_events_total'
  | 'outbox_failures_total'
  | 'rate_limit_hits_total'
  | 'csrf_failures_total';

type CounterKey = string;

const counters = new Map<CounterKey, number>();

function key(name: MetricName, labels?: Record<string, string>): CounterKey {
  if (!labels || !Object.keys(labels).length) return name;
  const parts = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
  return `${name}{${parts}}`;
}

export function incrMetric(name: MetricName, labels?: Record<string, string>, by = 1) {
  const k = key(name, labels);
  counters.set(k, (counters.get(k) || 0) + by);
}

export function getMetric(name: MetricName, labels?: Record<string, string>): number {
  return counters.get(key(name, labels)) || 0;
}

export function snapshotMetrics(): Record<string, number> {
  return Object.fromEntries(counters.entries());
}

export function resetMetrics() {
  counters.clear();
}

export function metricsPrometheusText(): string {
  const lines: string[] = ['# HELP imkan_payments metrics baseline (P15.2)', '# TYPE imkan_counter counter'];
  for (const [k, v] of counters.entries()) {
    const safe = k.replace(/[^a-zA-Z0-9_{}=,.-]/g, '_');
    lines.push(`${safe} ${v}`);
  }
  return lines.join('\n') + '\n';
}
