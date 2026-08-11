import {runPayTabsPreflight, formatPreflightSummary} from '../apps/api/src/providers/paytabs/preflight.js';

async function main() {
  const report = await runPayTabsPreflight();
  console.log(formatPreflightSummary(report));
  process.exit(report.e2eReady ? 0 : 2);
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
