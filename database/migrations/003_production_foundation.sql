CREATE TABLE IF NOT EXISTS api_keys (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, merchant_id CHAR(36), name VARCHAR(255) NOT NULL,
 key_prefix VARCHAR(32) NOT NULL, secret_hash CHAR(64) NOT NULL, last_used_at TIMESTAMP(6) NULL,
 expires_at TIMESTAMP(6) NULL, revoked_at TIMESTAMP(6) NULL, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_api_secret(secret_hash), INDEX(tenant_id), INDEX(merchant_id)
);
CREATE TABLE IF NOT EXISTS customers_addresses (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, customer_id CHAR(36) NOT NULL,
 line1 VARCHAR(255), line2 VARCHAR(255), city VARCHAR(128), state VARCHAR(128), postal_code VARCHAR(32), country CHAR(2),
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX(tenant_id), INDEX(customer_id)
);
CREATE TABLE IF NOT EXISTS users (
 id CHAR(36) PRIMARY KEY, tenant_id CHAR(36) NOT NULL, email VARCHAR(320) NOT NULL, name VARCHAR(255), status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE KEY uq_user_email(tenant_id,email), INDEX(tenant_id)
);
CREATE TABLE IF NOT EXISTS roles (id CHAR(36) PRIMARY KEY, tenant_id CHAR(36), name VARCHAR(128) NOT NULL, UNIQUE KEY uq_role(tenant_id,name), INDEX(tenant_id));
CREATE TABLE IF NOT EXISTS user_roles (user_id CHAR(36) NOT NULL, role_id CHAR(36) NOT NULL, PRIMARY KEY(user_id,role_id));
CREATE TABLE IF NOT EXISTS webhook_delivery_attempts (
 id CHAR(36) PRIMARY KEY, delivery_id CHAR(36) NOT NULL, attempt INT NOT NULL, response_code INT NULL, response_body TEXT NULL,
 error_message TEXT NULL, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX(delivery_id)
);
ALTER TABLE payment_links ADD COLUMN public_token VARCHAR(128) NULL;
CREATE UNIQUE INDEX uq_payment_link_token ON payment_links(public_token);

