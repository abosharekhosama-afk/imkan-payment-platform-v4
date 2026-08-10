```sql
CREATE TABLE IF NOT EXISTS payment_methods (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 customer_id CHAR(36) NOT NULL,
 type VARCHAR(32) NOT NULL,
 provider_token VARCHAR(255) NOT NULL,
 brand VARCHAR(64),
 last4 CHAR(4),
 exp_month TINYINT,
 exp_year SMALLINT,
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id),
 INDEX(customer_id),
 UNIQUE KEY uq_provider_token(tenant_id,provider_token)
);

CREATE TABLE IF NOT EXISTS payment_links (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 merchant_id CHAR(36) NOT NULL,
 amount_minor DECIMAL(30,0) NOT NULL,
 currency CHAR(3) NOT NULL,
 reference VARCHAR(255),
 description TEXT,
 customer_email VARCHAR(320),
 customer_phone VARCHAR(64),
 expires_at TIMESTAMP(6),
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_by CHAR(36),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 INDEX(tenant_id),
 INDEX(merchant_id),
 INDEX(status)
);

CREATE TABLE IF NOT EXISTS provider_webhook_events (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 provider VARCHAR(64) NOT NULL,
 external_event_id VARCHAR(255) NOT NULL,
 event_type VARCHAR(255) NOT NULL,
 signature VARCHAR(512),
 payload_json JSON NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
 processed_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_provider_event(provider,external_event_id),
 INDEX(tenant_id),
 INDEX(status)
);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 url TEXT NOT NULL,
 secret VARCHAR(255) NOT NULL,
 status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 subscribed_events JSON NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX(tenant_id)
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 endpoint_id CHAR(36) NOT NULL,
 event_id CHAR(36) NOT NULL,
 attempt INT NOT NULL DEFAULT 0,
 status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
 response_code INT,
 next_retry_at TIMESTAMP(6),
 delivered_at TIMESTAMP(6),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_delivery(endpoint_id,event_id),
 INDEX(status),
 INDEX(tenant_id)
);

CREATE TABLE IF NOT EXISTS financial_postings (
 id CHAR(36) PRIMARY KEY,
 tenant_id CHAR(36) NOT NULL,
 source_type VARCHAR(64) NOT NULL,
 source_id CHAR(36) NOT NULL,
 ledger_transaction_id CHAR(36) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_source(source_type,source_id),
 INDEX(tenant_id)
);
```
