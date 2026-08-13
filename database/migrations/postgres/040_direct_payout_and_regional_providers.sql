-- P17 — Direct payout dual-control + regional provider catalog (PS/GCC).

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rail_code TEXT NOT NULL DEFAULT 'audited_manual';
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rail_reference TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS external_evidence_ref TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS platform_approved_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS platform_approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS payouts_org_status_idx ON payouts (organization_id, status, created_at DESC);

INSERT INTO providers (code, name, status, supports_sandbox, supports_live, metadata_json)
VALUES
  (
    'jawwalpay',
    'Jawwal Pay',
    'ACTIVE',
    FALSE,
    FALSE,
    '{"region":"PS","currency_default":"ILS","integration":"HPP","status":"DISCOVERED"}'::jsonb
  ),
  (
    'palpay',
    'PalPay',
    'ACTIVE',
    FALSE,
    FALSE,
    '{"region":"PS","currency_default":"ILS","integration":"HPP","status":"DISCOVERED"}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  metadata_json = EXCLUDED.metadata_json,
  updated_at = NOW();
