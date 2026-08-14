-- Soft-delete memberships so the users UI can show REMOVED without dropping the row.

ALTER TABLE organization_users DROP CONSTRAINT IF EXISTS organization_users_status_chk;
ALTER TABLE organization_users
  ADD CONSTRAINT organization_users_status_chk
  CHECK (status IN ('ACTIVE', 'INVITED', 'DISABLED', 'REMOVED'));
