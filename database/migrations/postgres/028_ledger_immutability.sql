-- P15.0: Ledger immutability at DB layer (compensating entries only; no UPDATE/DELETE).
-- Additive only. Does not rewrite historical rows.

CREATE OR REPLACE FUNCTION ledger_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger_% is immutable; use compensating journal entries', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS ledger_journals_immutable_upd ON ledger_journals;
DROP TRIGGER IF EXISTS ledger_journals_immutable_del ON ledger_journals;
CREATE TRIGGER ledger_journals_immutable_upd
  BEFORE UPDATE ON ledger_journals
  FOR EACH ROW EXECUTE PROCEDURE ledger_forbid_mutation();
CREATE TRIGGER ledger_journals_immutable_del
  BEFORE DELETE ON ledger_journals
  FOR EACH ROW EXECUTE PROCEDURE ledger_forbid_mutation();

DROP TRIGGER IF EXISTS ledger_entries_immutable_upd ON ledger_entries;
DROP TRIGGER IF EXISTS ledger_entries_immutable_del ON ledger_entries;
CREATE TRIGGER ledger_entries_immutable_upd
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE PROCEDURE ledger_forbid_mutation();
CREATE TRIGGER ledger_entries_immutable_del
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE PROCEDURE ledger_forbid_mutation();
