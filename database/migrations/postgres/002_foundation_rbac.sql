-- Phase 1: RBAC foundation (V4 role codes)

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permissions_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_scope_chk CHECK (scope IN ('PLATFORM', 'MERCHANT')),
  CONSTRAINT roles_code_uq UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NULLs are distinct in UNIQUE constraints; use partial indexes.
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_platform_uq
  ON user_roles (user_id, role_id)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_merchant_uq
  ON user_roles (organization_id, user_id, role_id)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_user_role_scope()
RETURNS TRIGGER AS $$
DECLARE
  role_scope TEXT;
BEGIN
  SELECT scope INTO role_scope FROM roles WHERE id = NEW.role_id;
  IF role_scope IS NULL THEN
    RAISE EXCEPTION 'ROLE_NOT_FOUND';
  END IF;
  IF role_scope = 'PLATFORM' AND NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'PLATFORM_ROLE_MUST_NOT_HAVE_ORGANIZATION';
  END IF;
  IF role_scope = 'MERCHANT' AND NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_ROLE_REQUIRES_ORGANIZATION';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_roles_scope ON user_roles;
CREATE TRIGGER trg_user_roles_scope
  BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE PROCEDURE enforce_user_role_scope();

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org ON user_roles(organization_id);
