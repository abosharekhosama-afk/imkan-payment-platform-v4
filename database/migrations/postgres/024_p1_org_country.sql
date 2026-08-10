-- P1: organization country for signup/onboarding
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

COMMENT ON COLUMN organizations.country_code IS 'ISO 3166-1 alpha-2 country from merchant signup';
