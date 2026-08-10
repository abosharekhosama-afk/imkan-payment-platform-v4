-- V3.3 bootstrap: foundational tables required by the application before feature migrations.
CREATE TABLE IF NOT EXISTS tenants (
 id CHAR(36) PRIMARY KEY,
 name VARCHAR(255) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS merchants (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 legal_name VARCHAR(255) NOT NULL,
 display_name VARCHAR(255),
 country CHAR(2) NOT NULL DEFAULT 'US',
 default_currency CHAR(3) NOT NULL DEFAULT 'USD',
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 onboarding_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(status)
);

CREATE TABLE IF NOT EXISTS customers (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 name VARCHAR(255) NOT NULL,
 email VARCHAR(320),
 phone VARCHAR(64),
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(merchant_id), INDEX(email)
);

CREATE TABLE IF NOT EXISTS payment_sessions (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 customer_id CHAR(36) NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 reference VARCHAR(255),
 description TEXT,
 return_url TEXT,
 cancel_url TEXT,
 status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
 expires_at TIMESTAMP(6) NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(merchant_id), INDEX(customer_id), INDEX(status)
);

CREATE TABLE IF NOT EXISTS payment_attempts (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 payment_session_id CHAR(36) NOT NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 payment_method_id CHAR(36) NULL,
 provider_id VARCHAR(64) NOT NULL,
 provider_transaction_id VARCHAR(255) NULL,
 failure_code VARCHAR(128) NULL,
 failure_message TEXT NULL,
 action_required_json JSON NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(payment_session_id), INDEX(status), INDEX(provider_transaction_id)
);

CREATE TABLE IF NOT EXISTS payments (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 customer_id CHAR(36) NULL,
 payment_session_id CHAR(36) NULL,
 payment_attempt_id CHAR(36) NULL,
 provider_id VARCHAR(64) NOT NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 fee_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 currency CHAR(3) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'SUCCEEDED',
 risk_status VARCHAR(32),
 provider_transaction_id VARCHAR(255),
 payment_method_id CHAR(36),
 reference VARCHAR(255),
 description TEXT,
 
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(merchant_id), INDEX(customer_id), INDEX(status), INDEX(created_at), INDEX(payment_attempt_id)
);

CREATE TABLE IF NOT EXISTS refunds (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 payment_id CHAR(36) NOT NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 reason VARCHAR(255),
 provider_refund_id VARCHAR(255),
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(payment_id), INDEX(status)
);

CREATE TABLE IF NOT EXISTS payouts (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 bank_account_id CHAR(36) NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 gross_amount_minor DECIMAL(30,0) NOT NULL,
 fees_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 adjustments_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 net_amount_minor DECIMAL(30,0) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'PROCESSING',
 provider_reference VARCHAR(255),
 scheduled_at TIMESTAMP(6),
 processed_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(merchant_id), INDEX(status)
);

CREATE TABLE IF NOT EXISTS settlements (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 currency CHAR(3) NOT NULL,
 gross_amount_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 fees_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 adjustments_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 net_amount_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 settlement_date DATE NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 provider_reference VARCHAR(255),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(tenant_id), INDEX(merchant_id), INDEX(settlement_date)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 idem_key VARCHAR(255) NOT NULL,
 operation VARCHAR(128) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 response_json JSON NOT NULL,
 status INT NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_idempotency(tenant_id,idem_key),
 INDEX(tenant_id,created_at)
);

CREATE TABLE IF NOT EXISTS outbox_events (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 event_type VARCHAR(128) NOT NULL,
 aggregate_type VARCHAR(64) NOT NULL,
 aggregate_id CHAR(36) NOT NULL,
 payload_json JSON NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 published_at TIMESTAMP(6) NULL,
 INDEX(tenant_id,status), INDEX(status,created_at), INDEX(aggregate_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 user_id CHAR(36) NULL,
 action VARCHAR(128) NOT NULL,
 resource_type VARCHAR(64),
 resource_id CHAR(36),
 request_id VARCHAR(128),
 before_json JSON,
 after_json JSON,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(tenant_id,created_at), INDEX(request_id), INDEX(resource_type,resource_id)
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 code VARCHAR(255) NOT NULL,
 name VARCHAR(255) NOT NULL,
 type VARCHAR(32) NOT NULL,
 currency CHAR(3) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_ledger_account(tenant_id,code),
 INDEX(tenant_id)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 reference VARCHAR(255) NOT NULL,
 source_type VARCHAR(64) NOT NULL,
 source_id CHAR(36) NOT NULL,
 currency CHAR(3) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'POSTED',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_ledger_source(source_type,source_id),
 INDEX(tenant_id), INDEX(created_at)
);

CREATE TABLE IF NOT EXISTS ledger_entries (
 id CHAR(36) PRIMARY KEY,
 transaction_id CHAR(36) NOT NULL,
 account_id CHAR(36) NOT NULL,
 side VARCHAR(16) NOT NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(transaction_id), INDEX(account_id)
);

CREATE TABLE IF NOT EXISTS account_balances (
 account_id CHAR(36) PRIMARY KEY,
 ledger_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 available_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 pending_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 reserve_minor DECIMAL(30,0) NOT NULL DEFAULT 0,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);
