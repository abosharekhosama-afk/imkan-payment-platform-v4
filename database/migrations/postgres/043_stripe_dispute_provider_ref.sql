-- Stripe dispute correlation (webhook upsert by provider_dispute_ref).
CREATE UNIQUE INDEX IF NOT EXISTS disputes_org_provider_ref_uidx
  ON disputes (organization_id, provider_dispute_ref)
  WHERE provider_dispute_ref IS NOT NULL;
