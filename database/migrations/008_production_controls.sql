-- V3.2 production controls: password auth, security state, regional policy and integration queues.
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP(6) NULL;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP(6) NULL;
ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(64) NULL;
CREATE TABLE IF NOT EXISTS security_events (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36), user_id CHAR(36), event_type VARCHAR(128) NOT NULL,
 success BOOLEAN NOT NULL DEFAULT TRUE, ip VARCHAR(64), user_agent TEXT, metadata_json JSON,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX(tenant_id), INDEX(user_id), INDEX(event_type), INDEX(created_at)
);
CREATE TABLE IF NOT EXISTS regional_policies (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, country_code CHAR(2) NOT NULL,
 currency CHAR(3) NOT NULL, tax_mode VARCHAR(64) NOT NULL DEFAULT 'VAT', tax_rate_bps INT NOT NULL DEFAULT 0,
 invoice_required BOOLEAN NOT NULL DEFAULT FALSE, e_invoicing_mode VARCHAR(64) NOT NULL DEFAULT 'NONE',
 payment_provider VARCHAR(64), payout_provider VARCHAR(64), kyc_provider VARCHAR(64), risk_provider VARCHAR(64),
 config_json JSON, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_region_tenant_country(tenant_id,country_code), INDEX(tenant_id)
);
CREATE TABLE IF NOT EXISTS integration_outbox (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, event_id CHAR(36) NOT NULL,
 event_type VARCHAR(128) NOT NULL, aggregate_type VARCHAR(64) NOT NULL, aggregate_id CHAR(36) NOT NULL,
 payload_json JSON NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'PENDING', attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMP(6) NULL, last_error TEXT, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), processed_at TIMESTAMP(6) NULL,
 UNIQUE KEY uq_outbox_event(event_id), INDEX(tenant_id,status), INDEX(next_attempt_at)
);
CREATE TABLE IF NOT EXISTS integration_inbox (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, source VARCHAR(64) NOT NULL,
 external_event_id VARCHAR(255) NOT NULL, event_type VARCHAR(128) NOT NULL, payload_json JSON NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED', attempts INT NOT NULL DEFAULT 0, last_error TEXT,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), processed_at TIMESTAMP(6) NULL,
 UNIQUE KEY uq_inbox_source_event(source,external_event_id), INDEX(tenant_id,status)
);

