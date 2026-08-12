import {runStripePreflight, formatStripePreflightSummary} from '../apps/api/src/providers/stripe/preflight.js';

async function main() {
  const report = await runStripePreflight();
  console.log(formatStripePreflightSummary(report));
  process.exit(report.httpReady || report.adapterMode === 'simulate' ? 0 : 2);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
