/**
 * Register (or update) the Stripe webhook endpoint used by IMKAN.
 * Usage: STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_URL=https://api.example/api/v1/webhooks/providers/stripe node scripts/register-stripe-webhooks.mjs
 */
const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.refunded',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
  'radar.early_fraud_warning.created',
  'radar.early_fraud_warning.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',
];

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY || '';
  const url = process.env.STRIPE_WEBHOOK_URL || '';
  if (!secret.startsWith('sk_')) {
    console.error('Set STRIPE_SECRET_KEY (sk_test_… or sk_live_…)');
    process.exit(1);
  }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    console.error('Set STRIPE_WEBHOOK_URL to the public ingest URL');
    process.exit(1);
  }

  const listBody = new URLSearchParams({limit: '100'});
  const listed = await fetch('https://api.stripe.com/v1/webhook_endpoints?' + listBody.toString(), {
    headers: {Authorization: `Bearer ${secret}`},
  });
  const listJson = await listed.json();
  if (!listed.ok) {
    console.error(listJson?.error?.message || listed.status);
    process.exit(1);
  }
  const existing = (listJson.data || []).find((row) => row.url === url);

  const form = new URLSearchParams();
  form.set('url', url);
  form.set('description', 'IMKAN Payments provider ingest');
  for (const event of EVENTS) form.append('enabled_events[]', event);

  const path = existing ? `/v1/webhook_endpoints/${existing.id}` : '/v1/webhook_endpoints';
  const method = existing ? 'POST' : 'POST';
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(json?.error?.message || res.status);
    process.exit(1);
  }
  console.log(existing ? 'Updated webhook endpoint' : 'Created webhook endpoint');
  console.log('id:', json.id);
  console.log('url:', json.url);
  console.log('events:', (json.enabled_events || []).join(', '));
  if (json.secret) {
    console.log('signing secret (store as STRIPE_TEST_WEBHOOK_SECRET or STRIPE_LIVE_WEBHOOK_SECRET):', json.secret);
  } else {
    console.log('Signing secret is only shown on create. Keep the existing STRIPE_*_WEBHOOK_SECRET.');
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
