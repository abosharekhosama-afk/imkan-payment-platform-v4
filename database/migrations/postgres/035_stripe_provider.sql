-- Stripe provider seed (test + live planes)
-- Secrets never stored in PostgreSQL — secret_ref metadata only.
-- LIVE money requires STRIPE_ALLOW_LIVE=true + sk_live_ keys at runtime.

INSERT INTO providers (code, name, status, supports_sandbox, supports_live, metadata_json)
VALUES (
  'stripe',
  'Stripe',
  'ACTIVE',
  TRUE,
  TRUE,
  '{"integration": "Checkout_Session", "planes": ["test", "live"], "live_gate": "STRIPE_ALLOW_LIVE", "pci": "hosted_checkout_no_pan"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  supports_sandbox = TRUE,
  supports_live = TRUE,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();

INSERT INTO provider_capabilities (provider_id, capability_code, evidence_status, environment_scope, notes, verified_at)
SELECT p.id, c.capability_code, c.evidence_status, c.environment_scope, c.notes, NOW()
FROM providers p
CROSS JOIN (
  VALUES
    ('payment.authorize', 'VERIFIED', 'SANDBOX', 'Checkout Session create -> redirect URL (simulate + Stripe API)'),
    ('payment.capture', 'VERIFIED', 'SANDBOX', 'Checkout payment mode — capture coalesced'),
    ('payment.void', 'PARTIAL', 'SANDBOX', 'PaymentIntent cancel when pi_* reference'),
    ('payment.refund', 'VERIFIED', 'SANDBOX', 'POST /v1/refunds'),
    ('payment.partial_refund', 'VERIFIED', 'SANDBOX', 'Refund amount parameter'),
    ('payment.status', 'VERIFIED', 'SANDBOX', 'Retrieve PI or Checkout Session'),
    ('payment.tokenize', 'UNSUPPORTED', 'SANDBOX', 'Hosted Checkout — no PAN to IMKAN'),
    ('payment.recurring', 'UNSUPPORTED', 'SANDBOX', 'Subscriptions not in this adapter'),
    ('payment.three_ds', 'VERIFIED', 'SANDBOX', 'Handled on Stripe Checkout'),
    ('webhook.verify', 'VERIFIED', 'SANDBOX', 'Stripe-Signature HMAC (whsec_)'),
    ('webhook.normalize', 'VERIFIED', 'SANDBOX', 'payment_intent.* / checkout.session.*'),
    ('payment.disputes', 'PARTIAL', 'SANDBOX', 'charge.dispute.* events normalize; no evidence API yet'),
    ('payment.settlement', 'UNKNOWN', 'SANDBOX', 'Use Stripe reporting / balance transactions'),
    ('payment.payout', 'UNSUPPORTED', 'SANDBOX', 'Not in adapter scope'),
    ('payment.authorize', 'PARTIAL', 'LIVE', 'Same API; requires STRIPE_ALLOW_LIVE + sk_live_'),
    ('webhook.verify', 'PARTIAL', 'LIVE', 'Separate live webhook secret'),
    ('payment.refund', 'PARTIAL', 'LIVE', 'Live refunds when live plane enabled')
) AS c(capability_code, evidence_status, environment_scope, notes)
WHERE p.code = 'stripe'
ON CONFLICT (provider_id, capability_code, environment_scope) DO UPDATE SET
  evidence_status = EXCLUDED.evidence_status,
  notes = EXCLUDED.notes,
  verified_at = NOW(),
  updated_at = NOW();

INSERT INTO provider_accounts (organization_id, provider_id, environment, display_name, status, is_default, metadata_json)
SELECT NULL, p.id, 'SANDBOX', 'Platform Stripe Test', 'ACTIVE', FALSE,
       '{"shared": true, "plane": "test"}'::jsonb
FROM providers p
WHERE p.code = 'stripe'
ON CONFLICT (organization_id, provider_id, environment) DO NOTHING;

INSERT INTO provider_accounts (organization_id, provider_id, environment, display_name, status, is_default, metadata_json)
SELECT NULL, p.id, 'LIVE', 'Platform Stripe Live', 'ACTIVE', FALSE,
       '{"shared": true, "plane": "live", "requires": "STRIPE_ALLOW_LIVE"}'::jsonb
FROM providers p
WHERE p.code = 'stripe'
ON CONFLICT (organization_id, provider_id, environment) DO NOTHING;

INSERT INTO provider_credentials_metadata (
  provider_account_id, organization_id, credential_kind, secret_ref, environment, status, metadata_json
)
SELECT pa.id, NULL, kind, ref, env, 'ACTIVE', meta::jsonb
FROM provider_accounts pa
JOIN providers p ON p.id = pa.provider_id
CROSS JOIN (
  VALUES
    ('SANDBOX', 'API_KEY', 'STRIPE_TEST_SECRET_KEY', '{"purpose": "provider_api_key", "alt": "STRIPE_SECRET_KEY"}'),
    ('SANDBOX', 'WEBHOOK_SECRET', 'STRIPE_TEST_WEBHOOK_SECRET', '{"purpose": "stripe_webhook", "alt": "STRIPE_WEBHOOK_SECRET"}'),
    ('SANDBOX', 'OTHER', 'STRIPE_TEST_PUBLISHABLE_KEY', '{"purpose": "publishable_key"}'),
    ('LIVE', 'API_KEY', 'STRIPE_LIVE_SECRET_KEY', '{"purpose": "provider_api_key", "alt": "STRIPE_SECRET_KEY"}'),
    ('LIVE', 'WEBHOOK_SECRET', 'STRIPE_LIVE_WEBHOOK_SECRET', '{"purpose": "stripe_webhook", "alt": "STRIPE_WEBHOOK_SECRET"}'),
    ('LIVE', 'OTHER', 'STRIPE_LIVE_PUBLISHABLE_KEY', '{"purpose": "publishable_key"}')
) AS cred(env, kind, ref, meta)
WHERE p.code = 'stripe' AND pa.organization_id IS NULL AND pa.environment = cred.env
ON CONFLICT (provider_account_id, credential_kind, environment) DO UPDATE SET
  secret_ref = EXCLUDED.secret_ref,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();
