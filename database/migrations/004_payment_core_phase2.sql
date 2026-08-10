-- Phase 2: provider abstraction and explicit payment-method-session state.
CREATE TABLE IF NOT EXISTS payment_method_sessions (
id CHAR(36) PRIMARY KEY,
tenant_id CHAR(36) NOT NULL,
merchant_id CHAR(36) NOT NULL,
customer_id CHAR(36) NOT NULL,
type VARCHAR(32) NOT NULL,
provider VARCHAR(64) NOT NULL,
client_secret_hash CHAR(64) NOT NULL,
status VARCHAR(32) NOT NULL DEFAULT 'READY',
expires_at TIMESTAMP(6) NULL,
created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
UNIQUE KEY uq_payment_method_session_secret(client_secret_hash),
INDEX(tenant_id), INDEX(merchant_id), INDEX(customer_id), INDEX(status)
);

CREATE INDEX idx_payment_attempts_tenant_created
ON payment_attempts(tenant_id,created_at);

CREATE INDEX idx_payments_tenant_created
ON payments(tenant_id,created_at);

CREATE INDEX idx_refunds_tenant_created
ON refunds(tenant_id,created_at);

CREATE INDEX idx_outbox_pending
ON outbox_events(status,created_at);
