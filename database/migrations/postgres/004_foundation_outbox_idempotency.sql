-- Phase 1: outbox + idempotency foundations (no financial effects)

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT outbox_events_status_chk CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  CONSTRAINT outbox_events_org_idem_uq UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_available ON outbox_events(status, available_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idem_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  request_hash TEXT,
  response_json JSONB,
  status TEXT NOT NULL DEFAULT 'STARTED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT idempotency_keys_status_chk CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
  CONSTRAINT idempotency_keys_org_key_uq UNIQUE (organization_id, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(organization_id, created_at DESC);
