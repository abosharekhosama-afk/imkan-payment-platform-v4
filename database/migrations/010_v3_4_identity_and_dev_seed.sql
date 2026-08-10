-- V3.4: replace invalid zero UUID development fixtures with RFC-4122 UUIDs and
-- ensure the local development tenant/merchant/user are always available.
SET @tenant_id = '550e8400-e29b-41d4-a716-446655440000';
SET @merchant_id = '550e8400-e29b-41d4-a716-446655440001';
SET @customer_id = '550e8400-e29b-41d4-a716-446655440002';
SET @role_id = '550e8400-e29b-41d4-a716-446655440010';
SET @user_id = '550e8400-e29b-41d4-a716-446655440020';

INSERT INTO tenants(id,name,status) VALUES(@tenant_id,'Demo Tenant','ACTIVE')
ON DUPLICATE KEY UPDATE name=VALUES(name), status='ACTIVE';

INSERT INTO merchants(id,tenant_id,legal_name,display_name,country,default_currency,status,onboarding_status)
VALUES(@merchant_id,@tenant_id,'Demo Merchant LLC','Demo Merchant','US','USD','ACTIVE','APPROVED')
ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id), display_name=VALUES(display_name), status='ACTIVE', onboarding_status='APPROVED';

INSERT INTO customers(id,tenant_id,merchant_id,name,email,status)
VALUES(@customer_id,@tenant_id,@merchant_id,'Demo Customer','customer@example.test','ACTIVE')
ON DUPLICATE KEY UPDATE merchant_id=VALUES(merchant_id), status='ACTIVE';

INSERT INTO roles(id,tenant_id,name,description)
VALUES(@role_id,@tenant_id,'Owner','Full merchant access')
ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id), description=VALUES(description);

INSERT INTO users(id,tenant_id,email,name,status,password_hash)
VALUES(@user_id,@tenant_id,'admin@example.test','Demo Admin','ACTIVE','scrypt$5cfe4b8a9cbc75bd79b7f94afaec5ee4$b04e127cd3e6f32b65323426953e2ea3b5e8eae8ca96ec6d4086d215c20b8807d691ff3bd22a2c8914669baada5947a5bba318313ebfe92bd92b2d9c2af0df2e')
ON DUPLICATE KEY UPDATE tenant_id=VALUES(tenant_id), status='ACTIVE';

-- Development password: ChangeMe!123.
INSERT IGNORE INTO role_permissions(role_id,permission_id) SELECT @role_id,id FROM permissions;
INSERT IGNORE INTO user_roles(user_id,role_id) VALUES(@user_id,@role_id);
