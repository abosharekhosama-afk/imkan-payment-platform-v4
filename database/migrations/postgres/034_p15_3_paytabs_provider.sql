-- P15.3: PayTabs provider seed (SANDBOX only - LIVE blocked by DEC-009)
-- No secret values in PostgreSQL - secret_ref metadata only.

INSERT INTO providers (code, name, status, supports_sandbox, supports_live, metadata_json)
VALUES (
  'paytabs',
  'PayTabs',
  'ACTIVE',
  TRUE,
  FALSE,
  '{"integration": "HPP", "region_default": "MENA", "live_blocked_by": "DEC-009", "p15_3": "SANDBOX_ONLY"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  supports_sandbox = EXCLUDED.supports_sandbox,
  supports_live = FALSE,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();

INSERT INTO provider_capabilities (provider_id, capability_code, evidence_status, environment_scope, notes, verified_at)
SELECT p.id, c.capability_code, c.evidence_status, c.environment_scope, c.notes, NOW()
FROM providers p
CROSS JOIN (
  VALUES
    ('payment.authorize', 'VERIFIED', 'SANDBOX', 'HPP sale -> redirect_url (docs.paytabs.com + P15.3 tests)'),
    ('payment.capture', 'VERIFIED', 'SANDBOX', 'Sale coalesced - capture is no-op'),
    ('payment.void', 'UNKNOWN', 'SANDBOX', 'Void API not verified in P15.3'),
    ('payment.refund', 'VERIFIED', 'SANDBOX', 'POST /payment/request tran_type=refund (PayTabs docs)'),
    ('payment.partial_refund', 'PARTIAL', 'SANDBOX', 'Documented by PayTabs; IMKAN caps enforced'),
    ('payment.status', 'VERIFIED', 'SANDBOX', 'POST /payment/query by tran_ref'),
    ('payment.tokenize', 'UNSUPPORTED', 'SANDBOX', 'HPP hosted - no direct tokenize in adapter'),
    ('payment.recurring', 'UNSUPPORTED', 'SANDBOX', 'Not verified'),
    ('payment.three_ds', 'VERIFIED', 'SANDBOX', 'REQUIRES_ACTION redirect flow'),
    ('webhook.verify', 'VERIFIED', 'SANDBOX', 'HMAC-SHA256 callback signature (legacy + P15.3 tests)'),
    ('webhook.normalize', 'VERIFIED', 'SANDBOX', 'response_status mapping'),
    ('payment.disputes', 'UNKNOWN', 'SANDBOX', 'Not integrated in P15.3'),
    ('payment.settlement', 'UNKNOWN', 'SANDBOX', 'No settlement file import in P15.3'),
    ('payment.payout', 'UNSUPPORTED', 'SANDBOX', 'PayTabs payout rail not in scope')
) AS c(capability_code, evidence_status, environment_scope, notes)
WHERE p.code = 'paytabs'
ON CONFLICT (provider_id, capability_code, environment_scope) DO UPDATE SET
  evidence_status = EXCLUDED.evidence_status,
  notes = EXCLUDED.notes,
  verified_at = NOW(),
  updated_at = NOW();

-- Platform shared PayTabs SANDBOX account (organization_id NULL) for routing/tests
INSERT INTO provider_accounts (organization_id, provider_id, environment, display_name, status, is_default, metadata_json)
SELECT NULL, p.id, 'SANDBOX', 'Platform PayTabs Sandbox', 'ACTIVE', FALSE,
       '{"shared": true, "sandbox_only": true, "live_blocked_by": "DEC-009"}'::jsonb
FROM providers p
WHERE p.code = 'paytabs'
ON CONFLICT (organization_id, provider_id, environment) DO NOTHING;

INSERT INTO provider_credentials_metadata (
  provider_account_id, organization_id, credential_kind, secret_ref, environment, status, metadata_json
)
SELECT pa.id, NULL, kind, ref, 'SANDBOX', 'ACTIVE', meta::jsonb
FROM provider_accounts pa
JOIN providers p ON p.id = pa.provider_id
CROSS JOIN (
  VALUES
    ('API_KEY', 'PAYTABS_SANDBOX_SERVER_KEY', '{"purpose": "provider_api_key"}'),
    ('WEBHOOK_SECRET', 'PAYTABS_SANDBOX_SERVER_KEY', '{"purpose": "callback_hmac"}'),
    ('OTHER', 'PAYTABS_SANDBOX_PROFILE_ID', '{"purpose": "paytabs_config", "profile_id_ref": "PAYTABS_SANDBOX_PROFILE_ID", "base_url_ref": "PAYTABS_SANDBOX_BASE_URL", "callback_url_ref": "PAYTABS_SANDBOX_CALLBACK_URL", "return_url_ref": "PAYTABS_SANDBOX_RETURN_URL"}')
) AS cred(kind, ref, meta)
WHERE p.code = 'paytabs' AND pa.organization_id IS NULL AND pa.environment = 'SANDBOX'
ON CONFLICT (provider_account_id, credential_kind, environment) DO UPDATE SET
  secret_ref = EXCLUDED.secret_ref,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();
