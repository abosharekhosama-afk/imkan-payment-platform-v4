-- Real provider + accounting integrations. Sandbox remains available by configuration.
CREATE TABLE IF NOT EXISTS integration_connections (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 provider VARCHAR(64) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 external_account_id VARCHAR(255),
 access_token_encrypted TEXT,
 refresh_token_encrypted TEXT,
 access_token_expires_at TIMESTAMP(6),
 config_json JSON,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_integration_tenant_provider(tenant_id,provider), INDEX(tenant_id), INDEX(provider)
);
CREATE TABLE IF NOT EXISTS integration_sync_events (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 provider VARCHAR(64) NOT NULL,
 event_type VARCHAR(128) NOT NULL,
 local_resource_type VARCHAR(64),
 local_resource_id CHAR(36),
 external_resource_id VARCHAR(255),
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 attempts INT NOT NULL DEFAULT 0,
 next_retry_at TIMESTAMP(6),
 last_error TEXT,
 payload_json JSON,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 processed_at TIMESTAMP(6),
 INDEX(tenant_id), INDEX(provider,status), INDEX(local_resource_id)
);
CREATE TABLE IF NOT EXISTS provider_callbacks (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36),
 provider VARCHAR(64) NOT NULL,
 external_event_id VARCHAR(255) NOT NULL,
 signature_valid BOOLEAN NOT NULL DEFAULT FALSE,
 payload_json JSON NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 processed_at TIMESTAMP(6),
 UNIQUE KEY uq_provider_event(provider,external_event_id), INDEX(tenant_id), INDEX(status)
);
ALTER TABLE payment_attempts ADD COLUMN external_reference VARCHAR(255) NULL;
ALTER TABLE invoices ADD COLUMN external_invoice_id VARCHAR(255) NULL;
ALTER TABLE customers ADD COLUMN external_customer_id VARCHAR(255) NULL;

