-- Conformance: sandbox payment.refund is now VERIFIED (Financial Core refunds).
-- Live provider refunds remain blocked by DEC-009 / adapter registration policy.
UPDATE provider_capabilities pc
SET evidence_status = 'VERIFIED',
    notes = 'Sandbox refunds supported via Financial Core; live rails BLOCKED BY DEC-009',
    verified_at = NOW()
FROM providers p
WHERE pc.provider_id = p.id
  AND p.code = 'sandbox'
  AND pc.capability_code = 'payment.refund'
  AND pc.evidence_status <> 'VERIFIED';
