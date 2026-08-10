-- Phase 3: Master Data (spec §9/§10). Explicit DDL per table for auditability.
-- Global reference data: no tenant column; admin-only mutations (RBAC enforced in API layer).
-- metadata_json is for non-critical extensibility only; business-critical attributes are typed columns.

CREATE TABLE IF NOT EXISTS master_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,               -- ISO 3166-1 alpha-2 (stable business code)
  iso3 CHAR(3),                     -- ISO 3166-1 alpha-3
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_countries_code_uq UNIQUE (code),
  CONSTRAINT master_countries_iso3_uq UNIQUE (iso3),
  CONSTRAINT master_countries_code_chk CHECK (code ~ '^[A-Z]{2}$')
);

CREATE TABLE IF NOT EXISTS master_currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(3) NOT NULL,            -- ISO 4217 alpha code
  minor_units SMALLINT NOT NULL DEFAULT 2, -- financial attribute: typed, NOT metadata
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_currencies_code_uq UNIQUE (code),
  CONSTRAINT master_currencies_code_chk CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT master_currencies_minor_units_chk CHECK (minor_units BETWEEN 0 AND 4)
);

-- Legal structure (LLC, ...) — conceptually separate from business activity.
CREATE TABLE IF NOT EXISTS master_legal_entity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_legal_entity_types_code_uq UNIQUE (code)
);

-- Business activity nature (retail, services, marketplace, ...).
CREATE TABLE IF NOT EXISTS master_business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_business_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_industries_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_document_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_document_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_tax_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_tax_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_payout_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_payout_methods_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_payment_method_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_payment_method_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_provider_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_provider_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_provider_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_provider_capabilities_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_fee_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_fee_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_risk_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_risk_categories_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_webhook_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_webhook_event_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_address_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_address_types_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS master_identification_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  labels_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT master_identification_types_code_uq UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_master_countries_active ON master_countries(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_master_currencies_active ON master_currencies(is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Seeds: editable reference records (admin CRUD via API), NOT hardcoded rules.
-- ISO country/currency codes and ISO 4217 minor units are standard facts.
-- ---------------------------------------------------------------------------

INSERT INTO master_countries (code, iso3, name, sort_order) VALUES
  ('SA', 'SAU', 'Saudi Arabia', 10),
  ('AE', 'ARE', 'United Arab Emirates', 20),
  ('KW', 'KWT', 'Kuwait', 30),
  ('QA', 'QAT', 'Qatar', 40),
  ('BH', 'BHR', 'Bahrain', 50),
  ('OM', 'OMN', 'Oman', 60),
  ('EG', 'EGY', 'Egypt', 70),
  ('JO', 'JOR', 'Jordan', 80),
  ('US', 'USA', 'United States', 90),
  ('GB', 'GBR', 'United Kingdom', 100),
  ('DE', 'DEU', 'Germany', 110),
  ('FR', 'FRA', 'France', 120),
  ('TR', 'TUR', 'Turkey', 130),
  ('IN', 'IND', 'India', 140),
  ('PK', 'PAK', 'Pakistan', 150)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_currencies (code, minor_units, name, sort_order) VALUES
  ('SAR', 2, 'Saudi Riyal', 10),
  ('AED', 2, 'UAE Dirham', 20),
  ('KWD', 3, 'Kuwaiti Dinar', 30),
  ('QAR', 2, 'Qatari Riyal', 40),
  ('BHD', 3, 'Bahraini Dinar', 50),
  ('OMR', 3, 'Omani Rial', 60),
  ('EGP', 2, 'Egyptian Pound', 70),
  ('JOD', 3, 'Jordanian Dinar', 80),
  ('USD', 2, 'US Dollar', 90),
  ('EUR', 2, 'Euro', 100),
  ('GBP', 2, 'Pound Sterling', 110)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_legal_entity_types (code, name, sort_order) VALUES
  ('LLC', 'Limited Liability Company', 10),
  ('SOLE_PROPRIETORSHIP', 'Sole Proprietorship', 20),
  ('PARTNERSHIP', 'Partnership', 30),
  ('JOINT_STOCK', 'Joint Stock Company', 40),
  ('BRANCH_FOREIGN', 'Branch of Foreign Company', 50),
  ('NONPROFIT', 'Nonprofit Organization', 60),
  ('GOVERNMENT_ENTITY', 'Government Entity', 70)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_business_types (code, name, sort_order) VALUES
  ('RETAIL', 'Retail', 10),
  ('WHOLESALE', 'Wholesale', 20),
  ('SERVICES', 'Services', 30),
  ('MANUFACTURING', 'Manufacturing', 40),
  ('MARKETPLACE', 'Marketplace', 50),
  ('DIGITAL_GOODS', 'Digital Goods', 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_industries (code, name, sort_order) VALUES
  ('ECOMMERCE', 'E-commerce', 10),
  ('FOOD_BEVERAGE', 'Food and Beverage', 20),
  ('PROFESSIONAL_SERVICES', 'Professional Services', 30),
  ('EDUCATION', 'Education', 40),
  ('HEALTHCARE', 'Healthcare', 50),
  ('TRAVEL', 'Travel and Hospitality', 60),
  ('SOFTWARE_SAAS', 'Software / SaaS', 70),
  ('LOGISTICS', 'Logistics', 80),
  ('REAL_ESTATE', 'Real Estate', 90),
  ('OTHER', 'Other', 1000)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_document_types (code, name, sort_order) VALUES
  ('COMPANY_REGISTRATION', 'Company Registration / Incorporation Certificate', 10),
  ('BUSINESS_LICENSE', 'Business License', 20),
  ('ARTICLES_OF_ASSOCIATION', 'Articles of Association', 30),
  ('TAX_CERTIFICATE', 'Tax Certificate', 40),
  ('VAT_CERTIFICATE', 'VAT Certificate', 50),
  ('OWNER_ID', 'Owner Identification Document', 60),
  ('REPRESENTATIVE_AUTHORIZATION', 'Representative Authorization', 70),
  ('PROOF_OF_ADDRESS', 'Proof of Address', 80),
  ('BANK_LETTER', 'Bank Letter', 90),
  ('BANK_STATEMENT', 'Bank Statement', 100)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_tax_types (code, name, sort_order) VALUES
  ('VAT', 'Value Added Tax', 10),
  ('ZAKAT', 'Zakat', 20),
  ('CORPORATE_INCOME', 'Corporate Income Tax', 30),
  ('WITHHOLDING', 'Withholding Tax', 40),
  ('EXEMPT', 'Tax Exempt', 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_payout_methods (code, name, is_active, sort_order) VALUES
  ('BANK_TRANSFER', 'Local Bank Transfer', TRUE, 10),
  ('SWIFT_TRANSFER', 'International SWIFT Transfer', TRUE, 20),
  ('WALLET_TRANSFER', 'Wallet Transfer', FALSE, 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_payment_method_types (code, name, sort_order) VALUES
  ('CARD', 'Card', 10),
  ('WALLET', 'Wallet', 20),
  ('BANK_TRANSFER', 'Bank Transfer', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_provider_types (code, name, sort_order) VALUES
  ('GATEWAY', 'Payment Gateway', 10),
  ('ACQUIRER', 'Acquirer', 20),
  ('WALLET', 'Wallet Provider', 30),
  ('KYB_VERIFICATION', 'KYB / Business Verification Provider', 40),
  ('BANK_VERIFICATION', 'Bank Account Verification Provider', 50)
ON CONFLICT (code) DO NOTHING;

-- Capability codes come directly from spec §13.
INSERT INTO master_provider_capabilities (code, name, sort_order) VALUES
  ('PAYMENT', 'Payment', 10),
  ('REFUND', 'Refund', 20),
  ('PARTIAL_REFUND', 'Partial Refund', 30),
  ('RECURRING', 'Recurring', 40),
  ('TOKENIZATION', 'Tokenization', 50),
  ('THREE_DS', '3-D Secure', 60),
  ('PAYOUT', 'Payout', 70),
  ('DISPUTE', 'Dispute', 80),
  ('SETTLEMENT', 'Settlement', 90)
ON CONFLICT (code) DO NOTHING;

-- Labels only; fee rules/amounts remain an OPEN decision (DEC-006 area).
INSERT INTO master_fee_types (code, name, sort_order) VALUES
  ('PROCESSING', 'Processing Fee', 10),
  ('REFUND', 'Refund Fee', 20),
  ('CHARGEBACK', 'Chargeback Fee', 30),
  ('PAYOUT', 'Payout Fee', 40),
  ('SUBSCRIPTION', 'Subscription Fee', 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_risk_categories (code, name, sort_order) VALUES
  ('LOW', 'Low Risk', 10),
  ('MEDIUM', 'Medium Risk', 20),
  ('HIGH', 'High Risk', 30),
  ('PROHIBITED', 'Prohibited', 40)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_webhook_event_types (code, name, sort_order) VALUES
  ('kyb.case.submitted', 'KYB Case Submitted', 10),
  ('kyb.case.decided', 'KYB Case Decided', 20),
  ('kyb.case.needs_information', 'KYB Case Needs Information', 30),
  ('bank_account.created', 'Bank Account Created', 40),
  ('bank_account.verified', 'Bank Account Verified', 50),
  ('bank_account.status_changed', 'Bank Account Status Changed', 60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_address_types (code, name, sort_order) VALUES
  ('REGISTERED', 'Registered Address', 10),
  ('BUSINESS', 'Business / Operating Address', 20),
  ('MAILING', 'Mailing Address', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_identification_types (code, name, sort_order) VALUES
  ('NATIONAL_ID', 'National ID', 10),
  ('PASSPORT', 'Passport', 20),
  ('RESIDENCE_PERMIT', 'Residence Permit', 30),
  ('DRIVING_LICENSE', 'Driving License', 40)
ON CONFLICT (code) DO NOTHING;
