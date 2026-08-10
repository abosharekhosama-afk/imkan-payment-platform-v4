-- Phase 3: Merchant profile, legal/business data, people, documents, KYB workflow.
-- Conventions:
--   * tenant scope via organization_id FK -> organizations
--   * relational references to master data use UUID FK -> master_*.id (codes stay stable business identifiers)
--   * monetary currency tags use CHAR(3) with a database-enforced FK -> master_currencies(code) (DEC-001 pattern)
--   * append-only tables are protected by trigger forbid_append_only_mutation()

CREATE OR REPLACE FUNCTION forbid_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_TABLE';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Merchant / company profile
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS merchant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trading_name TEXT,
  website TEXT,
  support_email TEXT,
  support_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_profiles_org_uq UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS company_legal_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  registration_number TEXT,
  legal_entity_type_id UUID REFERENCES master_legal_entity_types(id),
  incorporation_country_id UUID REFERENCES master_countries(id),
  incorporation_date DATE,
  tax_type_id UUID REFERENCES master_tax_types(id),
  tax_id TEXT,
  vat_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_legal_profiles_org_uq UNIQUE (organization_id)
);

CREATE INDEX IF NOT EXISTS idx_company_legal_reg_number ON company_legal_profiles(registration_number);

CREATE TABLE IF NOT EXISTS company_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  address_type_id UUID NOT NULL REFERENCES master_address_types(id),
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state_region TEXT,
  postal_code TEXT,
  country_id UUID NOT NULL REFERENCES master_countries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_addresses_org_type_uq UNIQUE (organization_id, address_type_id)
);

CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_type_id UUID REFERENCES master_business_types(id),
  industry_id UUID REFERENCES master_industries(id),
  description TEXT,
  website TEXT,
  products_services TEXT,
  expected_monthly_volume_minor NUMERIC(30,0),
  average_transaction_minor NUMERIC(30,0),
  volume_currency_code CHAR(3) REFERENCES master_currencies(code),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_profiles_org_uq UNIQUE (organization_id),
  CONSTRAINT business_profiles_volume_chk CHECK (expected_monthly_volume_minor IS NULL OR expected_monthly_volume_minor >= 0),
  CONSTRAINT business_profiles_avg_chk CHECK (average_transaction_minor IS NULL OR average_transaction_minor >= 0),
  CONSTRAINT business_profiles_volume_currency_chk
    CHECK (
      (expected_monthly_volume_minor IS NULL AND average_transaction_minor IS NULL)
      OR volume_currency_code IS NOT NULL
    )
);

-- Normalized multi-value relations (no arrays; designed for future routing rules).
CREATE TABLE IF NOT EXISTS business_profile_countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  country_id UUID NOT NULL REFERENCES master_countries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_profile_countries_uq UNIQUE (business_profile_id, country_id)
);

CREATE TABLE IF NOT EXISTS business_profile_currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_profile_id UUID NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  currency_id UUID NOT NULL REFERENCES master_currencies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_profile_currencies_uq UNIQUE (business_profile_id, currency_id)
);

-- ---------------------------------------------------------------------------
-- People: beneficial owners, directors, authorized representatives
-- Identification numbers: encrypted + last4 + HMAC fingerprint (never plaintext).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS beneficial_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality_country_id UUID REFERENCES master_countries(id),
  identification_type_id UUID REFERENCES master_identification_types(id),
  identification_number_encrypted TEXT,
  identification_last4 TEXT,
  identification_fingerprint TEXT,
  ownership_percent NUMERIC(5,2) NOT NULL,
  is_pep BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT beneficial_owners_status_chk CHECK (status IN ('ACTIVE', 'REMOVED')),
  CONSTRAINT beneficial_owners_ownership_chk CHECK (ownership_percent > 0 AND ownership_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_beneficial_owners_org ON beneficial_owners(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_beneficial_owners_fp ON beneficial_owners(identification_fingerprint);

CREATE TABLE IF NOT EXISTS directors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT,
  date_of_birth DATE,
  nationality_country_id UUID REFERENCES master_countries(id),
  identification_type_id UUID REFERENCES master_identification_types(id),
  identification_number_encrypted TEXT,
  identification_last4 TEXT,
  identification_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT directors_status_chk CHECK (status IN ('ACTIVE', 'REMOVED'))
);

CREATE INDEX IF NOT EXISTS idx_directors_org ON directors(organization_id, status);

CREATE TABLE IF NOT EXISTS authorized_representatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role_title TEXT,
  is_signatory BOOLEAN NOT NULL DEFAULT FALSE,
  date_of_birth DATE,
  nationality_country_id UUID REFERENCES master_countries(id),
  identification_type_id UUID REFERENCES master_identification_types(id),
  identification_number_encrypted TEXT,
  identification_last4 TEXT,
  identification_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT authorized_representatives_status_chk CHECK (status IN ('ACTIVE', 'REMOVED'))
);

CREATE INDEX IF NOT EXISTS idx_auth_reps_org ON authorized_representatives(organization_id, status);

-- ---------------------------------------------------------------------------
-- Documents: metadata only (no binary content; storage_key is an opaque reference)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type_id UUID NOT NULL REFERENCES master_document_types(id),
  subject_type TEXT NOT NULL DEFAULT 'ORGANIZATION',
  subject_id UUID,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT,
  storage_key TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED',
  rejection_reason TEXT,
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT documents_subject_chk CHECK (
    subject_type IN ('ORGANIZATION', 'BENEFICIAL_OWNER', 'DIRECTOR', 'REPRESENTATIVE', 'PAYOUT_ACCOUNT')
  ),
  CONSTRAINT documents_status_chk CHECK (
    status IN ('UPLOADED', 'PENDING_REVIEW', 'ACCEPTED', 'REJECTED', 'ARCHIVED', 'EXPIRED')
  ),
  CONSTRAINT documents_size_chk CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_type ON documents(organization_id, document_type_id);

-- ---------------------------------------------------------------------------
-- KYB requirements: data-driven, selector-based (NOT a universal hardcoded rule).
-- NULL selector column = applies to all merchants; non-NULL narrows applicability.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kyb_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  requirement_type TEXT NOT NULL,
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  country_id UUID REFERENCES master_countries(id),
  legal_entity_type_id UUID REFERENCES master_legal_entity_types(id),
  business_type_id UUID REFERENCES master_business_types(id),
  industry_id UUID REFERENCES master_industries(id),
  risk_category_id UUID REFERENCES master_risk_categories(id),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kyb_requirements_code_uq UNIQUE (code),
  CONSTRAINT kyb_requirements_type_chk CHECK (
    requirement_type IN (
      'LEGAL_PROFILE', 'BUSINESS_PROFILE', 'ADDRESS', 'PERSON_MIN',
      'OWNERSHIP_TOTAL_MAX', 'DOCUMENT_TYPE', 'BANK_ACCOUNT'
    )
  )
);

-- Global defaults (editable via admin master-data/requirements APIs; selectors NULL = all merchants).
INSERT INTO kyb_requirements (code, requirement_type, params_json, description) VALUES
  ('KYB_LEGAL_PROFILE_REQUIRED', 'LEGAL_PROFILE', '{}', 'Legal profile must be complete'),
  ('KYB_BUSINESS_PROFILE_REQUIRED', 'BUSINESS_PROFILE', '{}', 'Business profile must be complete'),
  ('KYB_REGISTERED_ADDRESS_REQUIRED', 'ADDRESS', '{"address_type_code": "REGISTERED"}', 'Registered address required'),
  ('KYB_MIN_PERSONS', 'PERSON_MIN', '{"min_total": 1}', 'At least one owner/director/representative'),
  ('KYB_OWNERSHIP_TOTAL_MAX', 'OWNERSHIP_TOTAL_MAX', '{"max_percent": 100}', 'Total beneficial ownership must not exceed 100%'),
  ('KYB_DOC_COMPANY_REGISTRATION', 'DOCUMENT_TYPE', '{"document_type_code": "COMPANY_REGISTRATION"}', 'Company registration document required')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Verification cases (KYB workflow state machine) + append-only results/transitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS verification_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  case_type TEXT NOT NULL DEFAULT 'KYB',
  subject_type TEXT NOT NULL DEFAULT 'ORGANIZATION',
  subject_id UUID,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  risk_category_id UUID REFERENCES master_risk_categories(id),
  assigned_reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_cases_type_chk CHECK (case_type IN ('KYB', 'BANK_ACCOUNT')),
  CONSTRAINT verification_cases_status_chk CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFORMATION', 'APPROVED', 'REJECTED', 'SUSPENDED')
  )
);

-- One live KYB case per organization (a new case may start only after REJECTED).
CREATE UNIQUE INDEX IF NOT EXISTS verification_cases_kyb_live_uq
  ON verification_cases (organization_id)
  WHERE case_type = 'KYB' AND status <> 'REJECTED';

CREATE INDEX IF NOT EXISTS idx_verification_cases_status ON verification_cases(status, case_type);

CREATE TABLE IF NOT EXISTS verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL,
  result TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'internal',
  reviewer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_results_result_chk CHECK (
    result IN ('PASS', 'FAIL', 'WARN', 'PENDING', 'NOT_AVAILABLE')
  )
);

CREATE INDEX IF NOT EXISTS idx_verification_results_case ON verification_results(case_id, created_at);

DROP TRIGGER IF EXISTS trg_verification_results_append_only ON verification_results;
CREATE TRIGGER trg_verification_results_append_only
  BEFORE UPDATE OR DELETE ON verification_results
  FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();

-- Explicit state-transition history: full history NOT reconstructed from results.
CREATE TABLE IF NOT EXISTS verification_case_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES verification_cases(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_case_transitions_actor_chk CHECK (actor_type IN ('MERCHANT', 'PLATFORM', 'SYSTEM'))
);

CREATE INDEX IF NOT EXISTS idx_case_transitions_case ON verification_case_transitions(case_id, created_at);

DROP TRIGGER IF EXISTS trg_case_transitions_append_only ON verification_case_transitions;
CREATE TRIGGER trg_case_transitions_append_only
  BEFORE UPDATE OR DELETE ON verification_case_transitions
  FOR EACH ROW EXECUTE PROCEDURE forbid_append_only_mutation();
