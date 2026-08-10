-- Phase 6: Customers (DEC-006 interim) + Products/Prices catalog
-- ASCII-only comments.

-- Off-session billing collection: allow intents/attempts without checkout session/link
ALTER TABLE payment_sessions ALTER COLUMN payment_link_id DROP NOT NULL;
ALTER TABLE payment_attempts ALTER COLUMN payment_session_id DROP NOT NULL;
ALTER TABLE payment_transactions ALTER COLUMN payment_session_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  default_payment_method_token TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_status_chk CHECK (status IN ('ACTIVE', 'DISABLED')),
  CONSTRAINT customers_name_chk CHECK (char_length(trim(name)) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_email_uq
  ON customers (organization_id, lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org_created
  ON customers(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  product_type TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_type_chk CHECK (product_type IN ('ONE_TIME', 'SUBSCRIPTION')),
  CONSTRAINT products_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  CONSTRAINT products_name_chk CHECK (char_length(trim(name)) >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS products_org_code_uq
  ON products (organization_id, lower(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_org_status
  ON products(organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  currency_code CHAR(3) NOT NULL REFERENCES master_currencies(code),
  unit_amount_minor NUMERIC(30,0) NOT NULL,
  interval_unit TEXT NOT NULL DEFAULT 'MONTH',
  interval_count INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  nickname TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prices_amount_chk CHECK (unit_amount_minor > 0),
  CONSTRAINT prices_interval_unit_chk CHECK (interval_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')),
  CONSTRAINT prices_interval_count_chk CHECK (interval_count BETWEEN 1 AND 3650),
  CONSTRAINT prices_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  CONSTRAINT prices_currency_chk CHECK (currency_code ~ '^[A-Z]{3}$')
);

CREATE INDEX IF NOT EXISTS idx_prices_product
  ON prices(product_id, status);
CREATE INDEX IF NOT EXISTS idx_prices_org
  ON prices(organization_id, created_at DESC);
